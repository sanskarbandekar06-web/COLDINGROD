-- ==========================================
-- 013_lead_qualification_agent.sql
-- Phase 3.1: transparent lead qualification
-- ==========================================

-- The first production agent is deliberately deterministic. It creates useful,
-- auditable lead intelligence without requiring an external provider key. Later
-- research agents can supply these same signals through approved integrations.
INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    system_prompt,
    model
)
VALUES (
    '00000000-0000-4000-8000-000000000301',
    NULL,
    'Lead Qualification Agent',
    'Scores sales opportunity signals and records an auditable qualification result.',
    'Use only supplied evidence. Never invent missing facts. Return transparent score factors.',
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

-- A lead score is always a bounded percentage. Historical scores remain
-- immutable and provide an audit trail for every qualification run.
ALTER TABLE public.lead_scores
    ADD CONSTRAINT lead_scores_score_range
    CHECK (score BETWEEN 0 AND 100);

CREATE INDEX idx_lead_scores_recent
    ON public.lead_scores(lead_id, scored_at DESC);

CREATE UNIQUE INDEX idx_lead_scores_ai_action_unique
    ON public.lead_scores(ai_action_id)
    WHERE ai_action_id IS NOT NULL;

-- System-generated scores may be read by active workspace members but cannot
-- be inserted, rewritten, or deleted directly by authenticated clients.
REVOKE ALL PRIVILEGES ON TABLE public.lead_scores FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.lead_scores FROM authenticated;
GRANT SELECT ON TABLE public.lead_scores TO authenticated;

DROP POLICY IF EXISTS "lead_scores_insert" ON public.lead_scores;
DROP POLICY IF EXISTS "lead_scores_update" ON public.lead_scores;
DROP POLICY IF EXISTS "lead_scores_delete" ON public.lead_scores;

-- Prevent a manager from attaching an AI action to an agent owned by another
-- workspace. System agents (workspace_id IS NULL) remain available everywhere.
CREATE OR REPLACE FUNCTION public.validate_ai_action_agent_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.agent_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.ai_agents agent
           WHERE agent.id = NEW.agent_id
             AND agent.deleted_at IS NULL
             AND (
                 agent.workspace_id IS NULL
                 OR agent.workspace_id = NEW.workspace_id
             )
       )
    THEN
        RAISE EXCEPTION 'AI agent must be active and available to the action workspace'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_ai_action_agent_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_ai_action_agent_scope() FROM anon;
REVOKE ALL ON FUNCTION public.validate_ai_action_agent_scope() FROM authenticated;

DROP TRIGGER IF EXISTS validate_ai_action_agent_scope_before_write
    ON public.ai_actions;
CREATE TRIGGER validate_ai_action_agent_scope_before_write
BEFORE INSERT OR UPDATE OF workspace_id, agent_id
ON public.ai_actions
FOR EACH ROW
EXECUTE FUNCTION public.validate_ai_action_agent_scope();

CREATE OR REPLACE FUNCTION public.run_lead_qualification(
    check_workspace_id UUID,
    check_lead_id UUID,
    input_signals JSONB
)
RETURNS TABLE (
    action_id UUID,
    score_id UUID,
    score INTEGER,
    qualification_band TEXT,
    confidence INTEGER,
    factors JSONB,
    opportunities JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    qualification_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000301';
    algorithm_version CONSTANT TEXT := 'coldingrod-rules-v1';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    existing_lead public.leads%ROWTYPE;
    website_status TEXT;
    social_status TEXT;
    seo_status TEXT;
    google_rating NUMERIC;
    google_review_count INTEGER;
    has_clear_cta BOOLEAN;
    has_online_booking BOOLEAN;
    evidence_notes TEXT;
    calculated_score INTEGER := 0;
    known_signals INTEGER := 0;
    calculated_confidence INTEGER := 0;
    calculated_band TEXT;
    calculated_priority public.ai_action_priority := 'normal';
    factor_rows JSONB := '[]'::JSONB;
    opportunity_rows TEXT[] := ARRAY[]::TEXT[];
    created_action_id UUID;
    created_score_id UUID;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_workspace_permission(check_workspace_id, 'manage_ai')
       OR NOT public.has_workspace_permission(check_workspace_id, 'manage_leads')
    THEN
        RAISE EXCEPTION 'Lead qualification requires manage_ai and manage_leads'
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

    SELECT lead.*
    INTO existing_lead
    FROM public.leads lead
    WHERE lead.id = check_lead_id
      AND lead.workspace_id = check_workspace_id
      AND lead.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active lead not found in this workspace'
            USING ERRCODE = '22023';
    END IF;

    IF input_signals IS NULL OR jsonb_typeof(input_signals) <> 'object' THEN
        RAISE EXCEPTION 'Qualification signals must be a JSON object'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(input_signals) supplied_key
        WHERE supplied_key NOT IN (
            'website_status',
            'social_status',
            'seo_status',
            'google_rating',
            'google_review_count',
            'has_clear_cta',
            'has_online_booking',
            'evidence_notes'
        )
    ) THEN
        RAISE EXCEPTION 'Qualification signals contain an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    website_status := COALESCE(input_signals ->> 'website_status', 'unknown');
    social_status := COALESCE(input_signals ->> 'social_status', 'unknown');
    seo_status := COALESCE(input_signals ->> 'seo_status', 'unknown');

    IF website_status NOT IN ('unknown', 'none', 'poor', 'outdated', 'good') THEN
        RAISE EXCEPTION 'Invalid website status'
            USING ERRCODE = '22023';
    END IF;
    IF social_status NOT IN ('unknown', 'missing', 'inactive', 'active') THEN
        RAISE EXCEPTION 'Invalid social status'
            USING ERRCODE = '22023';
    END IF;
    IF seo_status NOT IN ('unknown', 'weak', 'average', 'strong') THEN
        RAISE EXCEPTION 'Invalid SEO status'
            USING ERRCODE = '22023';
    END IF;

    IF input_signals ? 'google_rating' THEN
        IF jsonb_typeof(input_signals -> 'google_rating') <> 'number' THEN
            RAISE EXCEPTION 'Google rating must be a number'
                USING ERRCODE = '22023';
        END IF;
        google_rating := (input_signals ->> 'google_rating')::NUMERIC;
        IF google_rating < 0 OR google_rating > 5 THEN
            RAISE EXCEPTION 'Google rating must be between 0 and 5'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF input_signals ? 'google_review_count' THEN
        IF jsonb_typeof(input_signals -> 'google_review_count') <> 'number' THEN
            RAISE EXCEPTION 'Google review count must be a whole number'
                USING ERRCODE = '22023';
        END IF;
        IF (input_signals ->> 'google_review_count')::NUMERIC
           <> trunc((input_signals ->> 'google_review_count')::NUMERIC)
        THEN
            RAISE EXCEPTION 'Google review count must be a whole number'
                USING ERRCODE = '22023';
        END IF;
        google_review_count := (input_signals ->> 'google_review_count')::INTEGER;
        IF google_review_count < 0 OR google_review_count > 1000000 THEN
            RAISE EXCEPTION 'Google review count is outside the supported range'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF input_signals ? 'has_clear_cta' THEN
        IF jsonb_typeof(input_signals -> 'has_clear_cta') <> 'boolean' THEN
            RAISE EXCEPTION 'Clear CTA signal must be true or false'
                USING ERRCODE = '22023';
        END IF;
        has_clear_cta := (input_signals ->> 'has_clear_cta')::BOOLEAN;
    END IF;

    IF input_signals ? 'has_online_booking' THEN
        IF jsonb_typeof(input_signals -> 'has_online_booking') <> 'boolean' THEN
            RAISE EXCEPTION 'Online booking signal must be true or false'
                USING ERRCODE = '22023';
        END IF;
        has_online_booking := (input_signals ->> 'has_online_booking')::BOOLEAN;
    END IF;

    IF input_signals ? 'evidence_notes' THEN
        IF jsonb_typeof(input_signals -> 'evidence_notes') <> 'string' THEN
            RAISE EXCEPTION 'Evidence notes must be text'
                USING ERRCODE = '22023';
        END IF;
        evidence_notes := NULLIF(btrim(input_signals ->> 'evidence_notes'), '');
        IF char_length(evidence_notes) > 1000 THEN
            RAISE EXCEPTION 'Evidence notes must be 1000 characters or fewer'
                USING ERRCODE = '22023';
        END IF;
    END IF;
    -- Higher points mean a stronger opportunity for the agency's services.
    calculated_score := calculated_score + CASE website_status
        WHEN 'none' THEN 32
        WHEN 'poor' THEN 24
        WHEN 'outdated' THEN 18
        WHEN 'unknown' THEN 8
        ELSE 0
    END;
    IF website_status <> 'unknown' THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'website',
        'label', 'Website opportunity',
        'signal', website_status,
        'points', CASE website_status
            WHEN 'none' THEN 32 WHEN 'poor' THEN 24 WHEN 'outdated' THEN 18
            WHEN 'unknown' THEN 8 ELSE 0 END
    ));
    IF website_status = 'none' THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Launch a modern conversion-focused website'
        );
    ELSIF website_status IN ('poor', 'outdated') THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Modernize the website and conversion journey'
        );
    END IF;

    calculated_score := calculated_score + CASE social_status
        WHEN 'missing' THEN 16
        WHEN 'inactive' THEN 12
        WHEN 'unknown' THEN 4
        ELSE 0
    END;
    IF social_status <> 'unknown' THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'social',
        'label', 'Social presence opportunity',
        'signal', social_status,
        'points', CASE social_status
            WHEN 'missing' THEN 16 WHEN 'inactive' THEN 12
            WHEN 'unknown' THEN 4 ELSE 0 END
    ));
    IF social_status IN ('missing', 'inactive') THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Build a consistent social content and engagement program'
        );
    END IF;

    calculated_score := calculated_score + CASE
        WHEN google_review_count IS NULL THEN 3
        WHEN google_review_count = 0 THEN 12
        WHEN google_review_count < 20 THEN 9
        WHEN google_review_count < 100 THEN 4
        ELSE 0
    END;
    IF google_review_count IS NOT NULL THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'reviews',
        'label', 'Review volume opportunity',
        'signal', COALESCE(google_review_count::TEXT, 'unknown'),
        'points', CASE
            WHEN google_review_count IS NULL THEN 3
            WHEN google_review_count = 0 THEN 12
            WHEN google_review_count < 20 THEN 9
            WHEN google_review_count < 100 THEN 4
            ELSE 0 END
    ));
    IF google_review_count IS NOT NULL AND google_review_count < 20 THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Create a Google review acquisition workflow'
        );
    END IF;

    calculated_score := calculated_score + CASE
        WHEN google_rating IS NULL THEN 2
        WHEN google_rating < 3.5 THEN 6
        WHEN google_rating < 4 THEN 3
        ELSE 0
    END;
    IF google_rating IS NOT NULL THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'rating',
        'label', 'Reputation opportunity',
        'signal', COALESCE(google_rating::TEXT, 'unknown'),
        'points', CASE
            WHEN google_rating IS NULL THEN 2
            WHEN google_rating < 3.5 THEN 6
            WHEN google_rating < 4 THEN 3
            ELSE 0 END
    ));

    calculated_score := calculated_score + CASE
        WHEN has_clear_cta IS NULL THEN 3
        WHEN has_clear_cta THEN 0
        ELSE 10
    END;
    IF has_clear_cta IS NOT NULL THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'cta',
        'label', 'Conversion CTA opportunity',
        'signal', CASE
            WHEN has_clear_cta IS NULL THEN 'unknown'
            WHEN has_clear_cta THEN 'present'
            ELSE 'missing' END,
        'points', CASE
            WHEN has_clear_cta IS NULL THEN 3
            WHEN has_clear_cta THEN 0
            ELSE 10 END
    ));
    IF has_clear_cta = false THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Add clear calls to action across key customer touchpoints'
        );
    END IF;

    calculated_score := calculated_score + CASE
        WHEN has_online_booking IS NULL THEN 2
        WHEN has_online_booking THEN 0
        ELSE 8
    END;
    IF has_online_booking IS NOT NULL THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'booking',
        'label', 'Online booking opportunity',
        'signal', CASE
            WHEN has_online_booking IS NULL THEN 'unknown'
            WHEN has_online_booking THEN 'available'
            ELSE 'missing' END,
        'points', CASE
            WHEN has_online_booking IS NULL THEN 2
            WHEN has_online_booking THEN 0
            ELSE 8 END
    ));
    IF has_online_booking = false THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Add an online booking or enquiry flow'
        );
    END IF;

    calculated_score := calculated_score + CASE seo_status
        WHEN 'weak' THEN 10
        WHEN 'average' THEN 4
        WHEN 'unknown' THEN 3
        ELSE 0
    END;
    IF seo_status <> 'unknown' THEN known_signals := known_signals + 1; END IF;
    factor_rows := factor_rows || jsonb_build_array(jsonb_build_object(
        'key', 'seo',
        'label', 'SEO opportunity',
        'signal', seo_status,
        'points', CASE seo_status
            WHEN 'weak' THEN 10 WHEN 'average' THEN 4
            WHEN 'unknown' THEN 3 ELSE 0 END
    ));
    IF seo_status = 'weak' THEN
        opportunity_rows := array_append(
            opportunity_rows,
            'Improve local search visibility and technical SEO'
        );
    END IF;

    IF known_signals < 3 THEN
        RAISE EXCEPTION 'At least three known signals are required for qualification'
            USING ERRCODE = '22023';
    END IF;

    calculated_score := LEAST(100, GREATEST(0, calculated_score));
    calculated_confidence := round((known_signals::NUMERIC / 7) * 100);
    calculated_band := CASE
        WHEN calculated_score >= 75 THEN 'high_priority'
        WHEN calculated_score >= 50 THEN 'qualified'
        WHEN calculated_score >= 30 THEN 'nurture'
        ELSE 'low_opportunity'
    END;
    calculated_priority := CASE
        WHEN calculated_score >= 75 THEN 'high'::public.ai_action_priority
        WHEN calculated_score >= 50 THEN 'normal'::public.ai_action_priority
        ELSE 'low'::public.ai_action_priority
    END;

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
        'qualify_lead',
        'completed',
        calculated_priority,
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'signals', input_signals - 'evidence_notes',
            'evidence_notes', evidence_notes
        ),
        jsonb_build_object(
            'algorithm_version', algorithm_version,
            'score', calculated_score,
            'qualification_band', calculated_band,
            'confidence', calculated_confidence,
            'factors', factor_rows,
            'opportunities', to_jsonb(opportunity_rows)
        ),
        qualification_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_action_id;

    INSERT INTO public.lead_scores (
        lead_id,
        score,
        algorithm_version,
        factors,
        ai_action_id
    )
    VALUES (
        check_lead_id,
        calculated_score,
        algorithm_version,
        jsonb_build_object(
            'qualification_band', calculated_band,
            'confidence', calculated_confidence,
            'factors', factor_rows,
            'opportunities', to_jsonb(opportunity_rows)
        ),
        created_action_id
    )
    RETURNING id INTO created_score_id;

    UPDATE public.leads
    SET
        status = CASE
            WHEN status = 'new' THEN 'analyzed'::public.lead_status
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = check_lead_id
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
        qualification_agent_id,
        'lead_qualified',
        jsonb_build_object(
            'ai_action_id', created_action_id,
            'score', calculated_score,
            'qualification_band', calculated_band,
            'confidence', calculated_confidence,
            'algorithm_version', algorithm_version
        )
    );

    RETURN QUERY
    SELECT
        created_action_id,
        created_score_id,
        calculated_score,
        calculated_band,
        calculated_confidence,
        factor_rows,
        to_jsonb(opportunity_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.run_lead_qualification(UUID, UUID, JSONB)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_lead_qualification(UUID, UUID, JSONB)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.run_lead_qualification(UUID, UUID, JSONB)
    TO authenticated;
