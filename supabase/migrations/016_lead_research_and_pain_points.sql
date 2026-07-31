-- ==========================================
-- 016_lead_research_and_pain_points.sql
-- Phase 3.3: evidence-backed research and pain-point analysis
-- ==========================================

INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    system_prompt,
    model
)
VALUES
    (
        '00000000-0000-4000-8000-000000000303',
        NULL,
        'Business Research Agent',
        'Structures verified business context and source links without inventing missing facts.',
        'Use only supplied research and stored lead evidence. Preserve unknowns, source links, and evidence boundaries. Never infer private facts.',
        'coldingrod-rules-v1'
    ),
    (
        '00000000-0000-4000-8000-000000000304',
        NULL,
        'Pain-Point Analysis Agent',
        'Maps observed qualification gaps to transparent business impacts and agency service opportunities.',
        'Derive pain points only from stored qualification factors with positive opportunity points. Explain the observed signal and deterministic mapping.',
        'coldingrod-rules-v1'
    )
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    deleted_at = NULL,
    updated_at = NOW();

CREATE TABLE public.lead_research_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL DEFAULT 'manual_observation',
    research_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_urls JSONB NOT NULL DEFAULT '[]'::JSONB,
    pain_points JSONB NOT NULL DEFAULT '[]'::JSONB,
    evidence_field_count INTEGER NOT NULL,
    source_count INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    qualification_score_id UUID NOT NULL
        REFERENCES public.lead_scores(id) ON DELETE RESTRICT,
    research_action_id UUID NOT NULL
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    analysis_action_id UUID NOT NULL
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_research_source_type_check
        CHECK (source_type IN ('manual_observation', 'provider_import')),
    CONSTRAINT lead_research_summary_object
        CHECK (jsonb_typeof(research_summary) = 'object'),
    CONSTRAINT lead_research_sources_array
        CHECK (
            jsonb_typeof(source_urls) = 'array'
            AND jsonb_array_length(source_urls) <= 10
        ),
    CONSTRAINT lead_research_pain_points_array
        CHECK (jsonb_typeof(pain_points) = 'array'),
    CONSTRAINT lead_research_evidence_count
        CHECK (evidence_field_count BETWEEN 2 AND 6),
    CONSTRAINT lead_research_source_count
        CHECK (source_count BETWEEN 0 AND 10),
    CONSTRAINT lead_research_confidence
        CHECK (confidence BETWEEN 0 AND 100),
    CONSTRAINT lead_research_actions_distinct
        CHECK (research_action_id <> analysis_action_id)
);

CREATE UNIQUE INDEX idx_lead_research_research_action
    ON public.lead_research_reports(research_action_id);
CREATE UNIQUE INDEX idx_lead_research_analysis_action
    ON public.lead_research_reports(analysis_action_id);
CREATE INDEX idx_lead_research_lead_recent
    ON public.lead_research_reports(lead_id, created_at DESC);
CREATE INDEX idx_lead_research_workspace_recent
    ON public.lead_research_reports(workspace_id, created_at DESC);

ALTER TABLE public.lead_research_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_research_reports_select"
ON public.lead_research_reports
FOR SELECT
USING (
    public.is_active_workspace_member(workspace_id)
    AND EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = lead_research_reports.lead_id
          AND lead.workspace_id = lead_research_reports.workspace_id
          AND lead.deleted_at IS NULL
    )
);

REVOKE ALL PRIVILEGES ON TABLE public.lead_research_reports FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.lead_research_reports
    FROM authenticated;
GRANT SELECT ON TABLE public.lead_research_reports TO authenticated;

CREATE OR REPLACE FUNCTION public.run_lead_research(
    check_workspace_id UUID,
    check_lead_id UUID,
    research_input JSONB
)
RETURNS TABLE (
    report_id UUID,
    research_action_id UUID,
    analysis_action_id UUID,
    confidence INTEGER,
    pain_point_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    research_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000303';
    pain_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000304';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    latest_score public.lead_scores%ROWTYPE;
    latest_analysis JSONB;
    input_summary JSONB := '{}'::JSONB;
    normalized_sources JSONB := '[]'::JSONB;
    generated_pain_points JSONB := '[]'::JSONB;
    source_type_value TEXT := 'manual_observation';
    field_name TEXT;
    field_value TEXT;
    source_value JSONB;
    source_text TEXT;
    evidence_fields INTEGER := 0;
    sources_total INTEGER := 0;
    research_confidence INTEGER;
    qualification_confidence INTEGER;
    combined_confidence INTEGER;
    generated_pain_count INTEGER;
    created_research_action_id UUID;
    created_analysis_action_id UUID;
    created_report_id UUID;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_ai'
    )
    OR NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_leads'
    )
    THEN
        RAISE EXCEPTION
            'Lead research requires manage_ai and manage_leads'
            USING ERRCODE = '42501';
    END IF;

    SELECT member.id
    INTO actor_member_id
    FROM public.workspace_members member
    WHERE member.workspace_id = check_workspace_id
      AND member.user_id = actor_user_id
      AND member.deleted_at IS NULL;

    IF actor_member_id IS NULL THEN
        RAISE EXCEPTION 'Active workspace membership required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = check_lead_id
          AND lead.workspace_id = check_workspace_id
          AND lead.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Active lead not found in workspace'
            USING ERRCODE = '22023';
    END IF;

    IF research_input IS NULL
       OR jsonb_typeof(research_input) <> 'object'
    THEN
        RAISE EXCEPTION 'Research input must be a JSON object'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(research_input) supplied_key
        WHERE supplied_key NOT IN (
            'source_type',
            'offerings',
            'target_audience',
            'differentiators',
            'recent_activity',
            'observed_challenges',
            'evidence_notes',
            'source_urls'
        )
    ) THEN
        RAISE EXCEPTION 'Research input contains an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    IF research_input ? 'source_type' THEN
        IF jsonb_typeof(research_input -> 'source_type') <> 'string' THEN
            RAISE EXCEPTION 'Research source type must be text'
                USING ERRCODE = '22023';
        END IF;
        source_type_value := btrim(research_input ->> 'source_type');
        IF source_type_value NOT IN (
            'manual_observation',
            'provider_import'
        ) THEN
            RAISE EXCEPTION 'Research source type is invalid'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    FOREACH field_name IN ARRAY ARRAY[
        'offerings',
        'target_audience',
        'differentiators',
        'recent_activity',
        'observed_challenges',
        'evidence_notes'
    ]
    LOOP
        IF research_input ? field_name THEN
            IF jsonb_typeof(research_input -> field_name) <> 'string' THEN
                RAISE EXCEPTION 'Research evidence fields must be text'
                    USING ERRCODE = '22023';
            END IF;
            field_value := NULLIF(
                btrim(research_input ->> field_name),
                ''
            );
            IF char_length(field_value) > 1000 THEN
                RAISE EXCEPTION
                    'Research evidence fields must be 1000 characters or fewer'
                    USING ERRCODE = '22023';
            END IF;
            IF field_value IS NOT NULL THEN
                evidence_fields := evidence_fields + 1;
                input_summary :=
                    input_summary || jsonb_build_object(
                        field_name,
                        field_value
                    );
            END IF;
        END IF;
    END LOOP;

    IF evidence_fields < 2 THEN
        RAISE EXCEPTION
            'Add at least two verified research evidence fields'
            USING ERRCODE = '22023';
    END IF;

    IF research_input ? 'source_urls' THEN
        IF jsonb_typeof(research_input -> 'source_urls') <> 'array'
           OR jsonb_array_length(research_input -> 'source_urls') > 10
        THEN
            RAISE EXCEPTION
                'Research sources must be an array of up to 10 URLs'
                USING ERRCODE = '22023';
        END IF;

        FOR source_value IN
            SELECT value
            FROM jsonb_array_elements(research_input -> 'source_urls')
        LOOP
            IF jsonb_typeof(source_value) <> 'string' THEN
                RAISE EXCEPTION 'Every research source must be a URL'
                    USING ERRCODE = '22023';
            END IF;
            source_text := btrim(source_value #>> '{}');
            IF char_length(source_text) NOT BETWEEN 8 AND 500
               OR source_text !~* '^https?://[^[:space:]]+$'
            THEN
                RAISE EXCEPTION
                    'Every research source must be a valid HTTP(S) URL'
                    USING ERRCODE = '22023';
            END IF;
            IF NOT normalized_sources ? source_text THEN
                normalized_sources :=
                    normalized_sources || jsonb_build_array(source_text);
            END IF;
        END LOOP;
    END IF;

    sources_total := jsonb_array_length(normalized_sources);
    IF source_type_value = 'provider_import' AND sources_total = 0 THEN
        RAISE EXCEPTION
            'Provider research requires at least one source URL'
            USING ERRCODE = '22023';
    END IF;

    SELECT score.*
    INTO latest_score
    FROM public.lead_scores score
    WHERE score.lead_id = check_lead_id
    ORDER BY score.scored_at DESC, score.id DESC
    LIMIT 1;

    IF NOT FOUND
       OR latest_score.factors IS NULL
       OR jsonb_typeof(latest_score.factors) <> 'object'
       OR jsonb_typeof(latest_score.factors -> 'factors') <> 'array'
    THEN
        RAISE EXCEPTION
            'Run lead qualification before business research'
            USING ERRCODE = '22023';
    END IF;

    latest_analysis := latest_score.factors;
    qualification_confidence := COALESCE(
        (latest_analysis ->> 'confidence')::INTEGER,
        0
    );
    research_confidence := LEAST(
        100,
        40 + (evidence_fields * 8) + (sources_total * 4)
    );
    combined_confidence := round(
        (qualification_confidence + research_confidence)::NUMERIC / 2
    )::INTEGER;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'key',
                factor ->> 'key',
                'label',
                CASE factor ->> 'key'
                    WHEN 'website' THEN 'Website conversion gap'
                    WHEN 'social' THEN 'Social demand gap'
                    WHEN 'seo' THEN 'Search visibility gap'
                    WHEN 'rating' THEN 'Reputation trust gap'
                    WHEN 'reviews' THEN 'Review capture gap'
                    WHEN 'cta' THEN 'Call-to-action friction'
                    WHEN 'booking' THEN 'Enquiry and booking friction'
                    ELSE COALESCE(
                        factor ->> 'label',
                        'Observed growth gap'
                    )
                END,
                'evidence',
                concat_ws(
                    ': ',
                    factor ->> 'label',
                    factor ->> 'signal'
                ),
                'impact',
                CASE factor ->> 'key'
                    WHEN 'website'
                        THEN 'Prospects may not understand or trust the offer quickly.'
                    WHEN 'social'
                        THEN 'The business may lose repeated awareness and proof.'
                    WHEN 'seo'
                        THEN 'High-intent local searches may not find the business.'
                    WHEN 'rating'
                        THEN 'Visible reputation may create trust hesitation.'
                    WHEN 'reviews'
                        THEN 'Limited social proof may weaken comparison decisions.'
                    WHEN 'cta'
                        THEN 'Interested visitors may not know the next step.'
                    WHEN 'booking'
                        THEN 'Manual enquiry steps may reduce completed conversions.'
                    ELSE 'The observed signal may limit predictable lead generation.'
                END,
                'service_opportunity',
                CASE factor ->> 'key'
                    WHEN 'website'
                        THEN 'Conversion-focused website redesign'
                    WHEN 'social'
                        THEN 'Social content and proof system'
                    WHEN 'seo'
                        THEN 'Local SEO and search content'
                    WHEN 'rating'
                        THEN 'Reputation response and trust strategy'
                    WHEN 'reviews'
                        THEN 'Review capture workflow'
                    WHEN 'cta'
                        THEN 'Offer and call-to-action optimization'
                    WHEN 'booking'
                        THEN 'Booking and lead-capture automation'
                    ELSE 'Evidence-led growth audit'
                END,
                'priority',
                CASE
                    WHEN (factor ->> 'points')::INTEGER >= 20 THEN 'high'
                    WHEN (factor ->> 'points')::INTEGER >= 10 THEN 'medium'
                    ELSE 'low'
                END,
                'points',
                (factor ->> 'points')::INTEGER
            )
            ORDER BY (factor ->> 'points')::INTEGER DESC
        ),
        '[]'::JSONB
    )
    INTO generated_pain_points
    FROM jsonb_array_elements(
        latest_analysis -> 'factors'
    ) AS factors(factor)
    WHERE (factor ->> 'points')::INTEGER > 0;

    generated_pain_count := jsonb_array_length(generated_pain_points);

    INSERT INTO public.ai_actions (
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        status,
        priority,
        started_at,
        finished_at,
        payload,
        result_data,
        agent_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        'lead',
        check_lead_id,
        'research_business',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'source_type',
            source_type_value,
            'evidence_fields',
            input_summary,
            'source_urls',
            normalized_sources
        ),
        jsonb_build_object(
            'evidence_field_count',
            evidence_fields,
            'source_count',
            sources_total,
            'research_confidence',
            research_confidence,
            'preserved_unknowns',
            TRUE
        ),
        research_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_research_action_id;

    INSERT INTO public.ai_actions (
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        status,
        priority,
        started_at,
        finished_at,
        payload,
        result_data,
        agent_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        'lead',
        check_lead_id,
        'analyze_pain_points',
        'completed',
        CASE
            WHEN latest_score.score >= 75
            THEN 'high'::public.ai_action_priority
            ELSE 'normal'::public.ai_action_priority
        END,
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'qualification_score_id',
            latest_score.id,
            'qualification_score',
            latest_score.score,
            'research_action_id',
            created_research_action_id
        ),
        jsonb_build_object(
            'pain_points',
            generated_pain_points,
            'pain_point_count',
            generated_pain_count,
            'confidence',
            combined_confidence,
            'rules_version',
            'coldingrod-rules-v1'
        ),
        pain_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_analysis_action_id;

    INSERT INTO public.lead_research_reports (
        workspace_id,
        lead_id,
        source_type,
        research_summary,
        source_urls,
        pain_points,
        evidence_field_count,
        source_count,
        confidence,
        qualification_score_id,
        research_action_id,
        analysis_action_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        check_lead_id,
        source_type_value,
        input_summary,
        normalized_sources,
        generated_pain_points,
        evidence_fields,
        sources_total,
        combined_confidence,
        latest_score.id,
        created_research_action_id,
        created_analysis_action_id,
        actor_user_id
    )
    RETURNING id INTO created_report_id;

    UPDATE public.ai_actions
    SET result_data =
        result_data || jsonb_build_object('report_id', created_report_id)
    WHERE id IN (
        created_research_action_id,
        created_analysis_action_id
    )
      AND workspace_id = check_workspace_id;

    INSERT INTO public.activities (
        workspace_id,
        entity_type,
        entity_id,
        actor_type,
        actor_user_id,
        workspace_member_id,
        actor_agent_id,
        action,
        metadata
    )
    VALUES (
        check_workspace_id,
        'lead',
        check_lead_id,
        'ai_agent',
        NULL,
        actor_member_id,
        pain_agent_id,
        'lead_research_completed',
        jsonb_build_object(
            'report_id',
            created_report_id,
            'research_action_id',
            created_research_action_id,
            'ai_action_id',
            created_analysis_action_id,
            'pain_point_count',
            generated_pain_count,
            'confidence',
            combined_confidence
        )
    );

    RETURN QUERY
    SELECT
        created_report_id,
        created_research_action_id,
        created_analysis_action_id,
        combined_confidence,
        generated_pain_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_lead_research(
    UUID,
    UUID,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_lead_research(
    UUID,
    UUID,
    JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_lead_research(
    UUID,
    UUID,
    JSONB
) TO authenticated;
