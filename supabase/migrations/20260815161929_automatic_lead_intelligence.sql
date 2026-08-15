-- Finalize automatically collected public research without turning unknown
-- qualification inputs into claimed pain points. When the public profile has
-- no material gap, retain a clearly-labelled exploratory opportunity so the
-- outreach workflow can still produce a neutral, human-reviewed introduction.

CREATE OR REPLACE FUNCTION public.finalize_automatic_lead_research(
    check_workspace_id UUID,
    check_lead_id UUID
)
RETURNS TABLE (
    report_id UUID,
    pain_points JSONB,
    used_neutral_opportunity BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    report_record RECORD;
    verified_points JSONB := '[]'::JSONB;
    neutral_point JSONB;
    used_neutral BOOLEAN := FALSE;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_workspace_permission(check_workspace_id, 'manage_ai')
       OR NOT public.has_workspace_permission(check_workspace_id, 'manage_leads')
    THEN
        RAISE EXCEPTION
            'Automatic research requires manage_ai and manage_leads'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.workspace_members member
        WHERE member.workspace_id = check_workspace_id
          AND member.user_id = actor_user_id
          AND member.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Active workspace membership required'
            USING ERRCODE = '42501';
    END IF;

    SELECT report.id, report.analysis_action_id, report.pain_points
    INTO report_record
    FROM public.lead_research_reports report
    JOIN public.leads lead
      ON lead.id = report.lead_id
     AND lead.workspace_id = report.workspace_id
     AND lead.deleted_at IS NULL
    WHERE report.workspace_id = check_workspace_id
      AND report.lead_id = check_lead_id
    ORDER BY report.created_at DESC, report.id DESC
    LIMIT 1
    FOR UPDATE OF report;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Automatic research report is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(jsonb_agg(point), '[]'::JSONB)
    INTO verified_points
    FROM jsonb_array_elements(report_record.pain_points) item(point)
    WHERE lower(COALESCE(point ->> 'evidence', '')) !~ ': unknown$';

    IF jsonb_array_length(verified_points) = 0 THEN
        used_neutral := TRUE;
        neutral_point := jsonb_build_object(
            'key', 'exploratory_growth',
            'label', 'Exploratory growth opportunity',
            'evidence',
                'Automatic public-profile review found no material gap; no performance claim is made.',
            'impact',
                'A short evidence-led review can test whether a useful growth improvement exists.',
            'service_opportunity',
                'Evidence-led growth audit and channel strategy',
            'priority', 'low',
            'points', 0
        );
        verified_points := jsonb_build_array(neutral_point);
    END IF;

    UPDATE public.lead_research_reports report
    SET pain_points = verified_points
    WHERE report.id = report_record.id
      AND report.workspace_id = check_workspace_id;

    UPDATE public.ai_actions action
    SET payload = action.payload || jsonb_build_object(
            'automatic_public_research', TRUE
        ),
        result_data = jsonb_set(
            jsonb_set(
                action.result_data,
                '{pain_points}',
                verified_points,
                TRUE
            ),
            '{pain_point_count}',
            to_jsonb(jsonb_array_length(verified_points)),
            TRUE
        ) || jsonb_build_object(
            'unknown_opportunities_removed', TRUE,
            'used_neutral_opportunity', used_neutral
        )
    WHERE action.id = report_record.analysis_action_id
      AND action.workspace_id = check_workspace_id;

    RETURN QUERY
    SELECT report_record.id::UUID, verified_points, used_neutral;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_automatic_lead_research(UUID, UUID)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_automatic_lead_research(UUID, UUID)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_automatic_lead_research(UUID, UUID)
    TO authenticated;
