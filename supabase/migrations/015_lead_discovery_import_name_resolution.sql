-- ==========================================
-- 015_lead_discovery_import_name_resolution.sql
-- Replace the already-deployed Phase 3.2 import RPC with explicitly qualified
-- run-count columns. Migration 014 carries the same fix for clean installs.
-- ==========================================

CREATE OR REPLACE FUNCTION public.import_lead_discovery_candidates(
    check_workspace_id UUID,
    check_run_id UUID,
    check_candidate_ids UUID[]
)
RETURNS TABLE (
    action_id UUID,
    selected_count INTEGER,
    imported_count INTEGER,
    duplicate_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    discovery_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000302';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    discovery_run public.lead_discovery_runs%ROWTYPE;
    candidate public.lead_discovery_candidates%ROWTYPE;
    existing_lead_id UUID;
    created_lead_id UUID;
    created_action_id UUID;
    supplied_count INTEGER;
    total_imported INTEGER := 0;
    total_duplicates INTEGER := 0;
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
            'Lead import requires manage_ai and manage_leads'
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

    supplied_count := cardinality(check_candidate_ids);
    IF check_candidate_ids IS NULL
       OR supplied_count NOT BETWEEN 1 AND 50
       OR EXISTS (
           SELECT 1
           FROM unnest(check_candidate_ids) AS selected(candidate_id)
           WHERE selected.candidate_id IS NULL
       )
       OR (
           SELECT count(DISTINCT selected.candidate_id)
           FROM unnest(check_candidate_ids) AS selected(candidate_id)
       ) <> supplied_count
    THEN
        RAISE EXCEPTION
            'Select between 1 and 50 unique discovery candidates'
            USING ERRCODE = '22023';
    END IF;

    SELECT run.*
    INTO discovery_run
    FROM public.lead_discovery_runs run
    WHERE run.id = check_run_id
      AND run.workspace_id = check_workspace_id
      AND run.deleted_at IS NULL
      AND run.status IN ('completed', 'partially_imported')
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Importable discovery run not found'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT count(*)
        FROM public.lead_discovery_candidates selected_candidate
        WHERE selected_candidate.run_id = check_run_id
          AND selected_candidate.workspace_id = check_workspace_id
          AND selected_candidate.id = ANY(check_candidate_ids)
          AND selected_candidate.status = 'ready'
    ) <> supplied_count
    THEN
        RAISE EXCEPTION
            'Every selected candidate must be ready for import'
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('coldingrod.suppress_audit', 'on', true);

    FOR candidate IN
        SELECT selected_candidate.*
        FROM public.lead_discovery_candidates selected_candidate
        WHERE selected_candidate.run_id = check_run_id
          AND selected_candidate.workspace_id = check_workspace_id
          AND selected_candidate.id = ANY(check_candidate_ids)
          AND selected_candidate.status = 'ready'
        ORDER BY selected_candidate.source_index
        FOR UPDATE
    LOOP
        existing_lead_id := NULL;

        SELECT lead.id
        INTO existing_lead_id
        FROM public.leads lead
        WHERE lead.workspace_id = check_workspace_id
          AND lead.deleted_at IS NULL
          AND lower(
              regexp_replace(
                  btrim(lead.company_name),
                  '[^[:alnum:]]+',
                  '',
                  'g'
              )
          ) = candidate.normalized_name
        ORDER BY lead.created_at
        LIMIT 1;

        IF existing_lead_id IS NOT NULL THEN
            UPDATE public.lead_discovery_candidates
            SET
                status = 'duplicate',
                matched_lead_id = existing_lead_id,
                duplicate_of_candidate_id = NULL,
                imported_lead_id = NULL
            WHERE id = candidate.id
              AND run_id = check_run_id;
            total_duplicates := total_duplicates + 1;
        ELSE
            INSERT INTO public.leads (
                workspace_id,
                company_name,
                status,
                source,
                website_url,
                industry,
                location,
                business_email,
                business_phone
            )
            VALUES (
                check_workspace_id,
                candidate.company_name,
                'new',
                'Lead Discovery: ' || discovery_run.run_name,
                candidate.website_url,
                candidate.industry,
                candidate.location,
                candidate.business_email,
                candidate.business_phone
            )
            RETURNING id INTO created_lead_id;

            UPDATE public.lead_discovery_candidates
            SET
                status = 'imported',
                imported_lead_id = created_lead_id,
                matched_lead_id = NULL,
                duplicate_of_candidate_id = NULL
            WHERE id = candidate.id
              AND run_id = check_run_id;
            total_imported := total_imported + 1;
        END IF;
    END LOOP;

    PERFORM set_config('coldingrod.suppress_audit', 'off', true);

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
        'lead_discovery_run',
        check_run_id,
        'import_discovered_leads',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'run_id',
            check_run_id,
            'selected_count',
            supplied_count
        ),
        jsonb_build_object(
            'imported_count',
            total_imported,
            'duplicate_count',
            total_duplicates
        ),
        discovery_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_action_id;

    UPDATE public.lead_discovery_runs AS run
    SET
        ready_count = run.ready_count - supplied_count,
        duplicate_count = run.duplicate_count + total_duplicates,
        imported_count = run.imported_count + total_imported,
        status = CASE
            WHEN run.ready_count - supplied_count = 0
            THEN 'imported'
            ELSE 'partially_imported'
        END
    WHERE id = check_run_id
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
        'lead_discovery_run',
        check_run_id,
        'human',
        actor_user_id,
        actor_member_id,
        NULL,
        'discovered_leads_imported',
        jsonb_build_object(
            'ai_action_id',
            created_action_id,
            'run_name',
            discovery_run.run_name,
            'selected_count',
            supplied_count,
            'imported_count',
            total_imported,
            'duplicate_count',
            total_duplicates
        )
    );

    RETURN QUERY
    SELECT
        created_action_id,
        supplied_count,
        total_imported,
        total_duplicates;
END;
$$;

REVOKE ALL ON FUNCTION public.import_lead_discovery_candidates(
    UUID,
    UUID,
    UUID[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_lead_discovery_candidates(
    UUID,
    UUID,
    UUID[]
) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_lead_discovery_candidates(
    UUID,
    UUID,
    UUID[]
) TO authenticated;
