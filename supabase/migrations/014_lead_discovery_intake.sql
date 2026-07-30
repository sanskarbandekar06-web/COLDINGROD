-- ==========================================
-- 014_lead_discovery_intake.sql
-- Phase 3.2: lead-discovery intake and orchestration
-- ==========================================

INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    system_prompt,
    model
)
VALUES (
    '00000000-0000-4000-8000-000000000302',
    NULL,
    'Lead Discovery Agent',
    'Validates, deduplicates, and stages observed businesses for human-reviewed lead import.',
    'Use only supplied business evidence. Never invent candidates or contact details. Preserve source evidence and require human selection before creating leads.',
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

-- Rich business fields support discovery today and provider-backed research in
-- later Phase 3/4 slices without overloading the human-readable source label.
ALTER TABLE public.leads
    ADD COLUMN website_url TEXT,
    ADD COLUMN industry TEXT,
    ADD COLUMN location TEXT,
    ADD COLUMN business_email TEXT,
    ADD COLUMN business_phone TEXT;

ALTER TABLE public.leads
    ADD CONSTRAINT leads_website_url_length
        CHECK (website_url IS NULL OR char_length(website_url) <= 500),
    ADD CONSTRAINT leads_industry_length
        CHECK (industry IS NULL OR char_length(industry) <= 160),
    ADD CONSTRAINT leads_location_length
        CHECK (location IS NULL OR char_length(location) <= 240),
    ADD CONSTRAINT leads_business_email_length
        CHECK (business_email IS NULL OR char_length(business_email) <= 320),
    ADD CONSTRAINT leads_business_phone_length
        CHECK (business_phone IS NULL OR char_length(business_phone) <= 80);

CREATE TABLE public.lead_discovery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    run_name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual_intake',
    market TEXT,
    target_location TEXT,
    service_focus TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    candidate_count INTEGER NOT NULL DEFAULT 0,
    ready_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    ai_action_id UUID REFERENCES public.ai_actions(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT lead_discovery_runs_name_length
        CHECK (char_length(btrim(run_name)) BETWEEN 2 AND 160),
    CONSTRAINT lead_discovery_runs_source_type_check
        CHECK (source_type IN (
            'manual_intake',
            'csv_import',
            'google_places',
            'web_search'
        )),
    CONSTRAINT lead_discovery_runs_status_check
        CHECK (status IN (
            'running',
            'completed',
            'partially_imported',
            'imported',
            'failed',
            'cancelled'
        )),
    CONSTRAINT lead_discovery_runs_market_length
        CHECK (market IS NULL OR char_length(market) <= 160),
    CONSTRAINT lead_discovery_runs_location_length
        CHECK (target_location IS NULL OR char_length(target_location) <= 240),
    CONSTRAINT lead_discovery_runs_service_length
        CHECK (service_focus IS NULL OR char_length(service_focus) <= 240),
    CONSTRAINT lead_discovery_runs_notes_length
        CHECK (notes IS NULL OR char_length(notes) <= 1000),
    CONSTRAINT lead_discovery_runs_counts_check
        CHECK (
            candidate_count >= 0
            AND ready_count >= 0
            AND duplicate_count >= 0
            AND imported_count >= 0
            AND ready_count + duplicate_count + imported_count <= candidate_count
        ),
    CONSTRAINT lead_discovery_runs_finish_check
        CHECK (
            (status = 'running' AND finished_at IS NULL)
            OR (status <> 'running' AND finished_at IS NOT NULL)
        ),
    CONSTRAINT lead_discovery_runs_id_workspace_key
        UNIQUE (id, workspace_id)
);

CREATE TABLE public.lead_discovery_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    source_index INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    website_url TEXT,
    industry TEXT,
    location TEXT,
    source_url TEXT,
    business_email TEXT,
    business_phone TEXT,
    evidence_notes TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    matched_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    duplicate_of_candidate_id UUID
        REFERENCES public.lead_discovery_candidates(id) ON DELETE SET NULL,
    imported_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_discovery_candidates_run_workspace_fkey
        FOREIGN KEY (run_id, workspace_id)
        REFERENCES public.lead_discovery_runs(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT lead_discovery_candidates_source_index_check
        CHECK (source_index BETWEEN 1 AND 50),
    CONSTRAINT lead_discovery_candidates_company_length
        CHECK (char_length(btrim(company_name)) BETWEEN 2 AND 160),
    CONSTRAINT lead_discovery_candidates_normalized_length
        CHECK (char_length(normalized_name) BETWEEN 1 AND 160),
    CONSTRAINT lead_discovery_candidates_fingerprint_length
        CHECK (char_length(fingerprint) = 32),
    CONSTRAINT lead_discovery_candidates_website_length
        CHECK (website_url IS NULL OR char_length(website_url) <= 500),
    CONSTRAINT lead_discovery_candidates_industry_length
        CHECK (industry IS NULL OR char_length(industry) <= 160),
    CONSTRAINT lead_discovery_candidates_location_length
        CHECK (location IS NULL OR char_length(location) <= 240),
    CONSTRAINT lead_discovery_candidates_source_url_length
        CHECK (source_url IS NULL OR char_length(source_url) <= 500),
    CONSTRAINT lead_discovery_candidates_email_length
        CHECK (business_email IS NULL OR char_length(business_email) <= 320),
    CONSTRAINT lead_discovery_candidates_phone_length
        CHECK (business_phone IS NULL OR char_length(business_phone) <= 80),
    CONSTRAINT lead_discovery_candidates_evidence_length
        CHECK (evidence_notes IS NULL OR char_length(evidence_notes) <= 1000),
    CONSTRAINT lead_discovery_candidates_status_check
        CHECK (status IN ('ready', 'duplicate', 'imported', 'dismissed')),
    CONSTRAINT lead_discovery_candidates_status_links_check
        CHECK (
            (
                status = 'duplicate'
                AND (
                    matched_lead_id IS NOT NULL
                    OR duplicate_of_candidate_id IS NOT NULL
                )
                AND imported_lead_id IS NULL
            )
            OR (
                status = 'imported'
                AND imported_lead_id IS NOT NULL
                AND matched_lead_id IS NULL
                AND duplicate_of_candidate_id IS NULL
            )
            OR (
                status IN ('ready', 'dismissed')
                AND matched_lead_id IS NULL
                AND duplicate_of_candidate_id IS NULL
                AND imported_lead_id IS NULL
            )
        ),
    CONSTRAINT lead_discovery_candidates_run_index_key
        UNIQUE (run_id, source_index)
);

CREATE UNIQUE INDEX idx_lead_discovery_runs_ai_action
    ON public.lead_discovery_runs(ai_action_id)
    WHERE ai_action_id IS NOT NULL;
CREATE INDEX idx_lead_discovery_runs_workspace_recent
    ON public.lead_discovery_runs(workspace_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_discovery_runs_workspace_status
    ON public.lead_discovery_runs(workspace_id, status, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_discovery_candidates_run_status
    ON public.lead_discovery_candidates(run_id, status, source_index);
CREATE INDEX idx_lead_discovery_candidates_workspace_name
    ON public.lead_discovery_candidates(workspace_id, normalized_name);
CREATE INDEX idx_leads_workspace_normalized_company
    ON public.leads(
        workspace_id,
        lower(regexp_replace(btrim(company_name), '[^[:alnum:]]+', '', 'g'))
    )
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_lead_discovery_runs
BEFORE UPDATE ON public.lead_discovery_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_lead_discovery_candidates
BEFORE UPDATE ON public.lead_discovery_candidates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_discovery_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_discovery_runs_select"
ON public.lead_discovery_runs
FOR SELECT
USING (
    deleted_at IS NULL
    AND public.is_active_workspace_member(workspace_id)
);

CREATE POLICY "lead_discovery_candidates_select"
ON public.lead_discovery_candidates
FOR SELECT
USING (
    public.is_active_workspace_member(workspace_id)
    AND EXISTS (
        SELECT 1
        FROM public.lead_discovery_runs discovery_run
        WHERE discovery_run.id = lead_discovery_candidates.run_id
          AND discovery_run.workspace_id =
              lead_discovery_candidates.workspace_id
          AND discovery_run.deleted_at IS NULL
    )
);

REVOKE ALL PRIVILEGES ON TABLE public.lead_discovery_runs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.lead_discovery_runs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.lead_discovery_candidates FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.lead_discovery_candidates
    FROM authenticated;
GRANT SELECT ON TABLE public.lead_discovery_runs TO authenticated;
GRANT SELECT ON TABLE public.lead_discovery_candidates TO authenticated;

-- Batch lead imports would otherwise create one generic audit notification per
-- row. Trusted batch functions can suppress those generic rows and emit one
-- descriptive run-level event instead.
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    action_name TEXT;
    entity_id UUID;
    ws_id UUID;
    member_id UUID;
BEGIN
    IF current_setting('coldingrod.suppress_audit', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
        action_name := 'created';
        entity_id := NEW.id;
        ws_id := NEW.workspace_id;
    ELSIF TG_OP = 'UPDATE' THEN
        action_name := 'updated';
        entity_id := NEW.id;
        ws_id := NEW.workspace_id;
    ELSIF TG_OP = 'DELETE' THEN
        action_name := 'deleted';
        entity_id := OLD.id;
        ws_id := OLD.workspace_id;
    END IF;

    IF auth.uid() IS NOT NULL AND ws_id IS NOT NULL THEN
        SELECT member.id
        INTO member_id
        FROM public.workspace_members member
        WHERE member.user_id = auth.uid()
          AND member.workspace_id = ws_id
          AND member.deleted_at IS NULL
        LIMIT 1;

        INSERT INTO public.activities (
            workspace_id,
            entity_type,
            entity_id,
            actor_type,
            actor_user_id,
            workspace_member_id,
            action
        )
        VALUES (
            ws_id,
            TG_TABLE_NAME,
            entity_id,
            'human',
            auth.uid(),
            member_id,
            action_name
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM authenticated;

CREATE OR REPLACE FUNCTION public.run_lead_discovery_intake(
    check_workspace_id UUID,
    intake_brief JSONB,
    intake_candidates JSONB
)
RETURNS TABLE (
    run_id UUID,
    action_id UUID,
    candidate_count INTEGER,
    ready_count INTEGER,
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
    created_run_id UUID;
    created_action_id UUID;
    supplied_candidate JSONB;
    source_position INTEGER;
    run_name_value TEXT;
    market_value TEXT;
    location_value TEXT;
    service_focus_value TEXT;
    notes_value TEXT;
    company_name_value TEXT;
    normalized_name_value TEXT;
    fingerprint_value TEXT;
    website_url_value TEXT;
    industry_value TEXT;
    candidate_location_value TEXT;
    source_url_value TEXT;
    business_email_value TEXT;
    business_phone_value TEXT;
    evidence_notes_value TEXT;
    existing_lead_id UUID;
    existing_candidate_id UUID;
    total_candidates INTEGER := 0;
    total_ready INTEGER := 0;
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
            'Lead discovery requires manage_ai and manage_leads'
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

    IF intake_brief IS NULL
       OR jsonb_typeof(intake_brief) <> 'object'
    THEN
        RAISE EXCEPTION 'Discovery brief must be a JSON object'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(intake_brief) supplied_key
        WHERE supplied_key NOT IN (
            'run_name',
            'market',
            'location',
            'service_focus',
            'notes'
        )
    ) THEN
        RAISE EXCEPTION 'Discovery brief contains an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (intake_brief ? 'run_name')
       OR jsonb_typeof(intake_brief -> 'run_name') <> 'string'
    THEN
        RAISE EXCEPTION 'Discovery name is required'
            USING ERRCODE = '22023';
    END IF;

    run_name_value := btrim(intake_brief ->> 'run_name');
    IF char_length(run_name_value) NOT BETWEEN 2 AND 160 THEN
        RAISE EXCEPTION
            'Discovery name must be between 2 and 160 characters'
            USING ERRCODE = '22023';
    END IF;

    IF intake_brief ? 'market' THEN
        IF jsonb_typeof(intake_brief -> 'market') <> 'string' THEN
            RAISE EXCEPTION 'Market must be text'
                USING ERRCODE = '22023';
        END IF;
        market_value := NULLIF(btrim(intake_brief ->> 'market'), '');
        IF char_length(market_value) > 160 THEN
            RAISE EXCEPTION 'Market must be 160 characters or fewer'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF intake_brief ? 'location' THEN
        IF jsonb_typeof(intake_brief -> 'location') <> 'string' THEN
            RAISE EXCEPTION 'Location must be text'
                USING ERRCODE = '22023';
        END IF;
        location_value := NULLIF(btrim(intake_brief ->> 'location'), '');
        IF char_length(location_value) > 240 THEN
            RAISE EXCEPTION 'Location must be 240 characters or fewer'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF intake_brief ? 'service_focus' THEN
        IF jsonb_typeof(intake_brief -> 'service_focus') <> 'string' THEN
            RAISE EXCEPTION 'Service focus must be text'
                USING ERRCODE = '22023';
        END IF;
        service_focus_value :=
            NULLIF(btrim(intake_brief ->> 'service_focus'), '');
        IF char_length(service_focus_value) > 240 THEN
            RAISE EXCEPTION
                'Service focus must be 240 characters or fewer'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF intake_brief ? 'notes' THEN
        IF jsonb_typeof(intake_brief -> 'notes') <> 'string' THEN
            RAISE EXCEPTION 'Discovery notes must be text'
                USING ERRCODE = '22023';
        END IF;
        notes_value := NULLIF(btrim(intake_brief ->> 'notes'), '');
        IF char_length(notes_value) > 1000 THEN
            RAISE EXCEPTION
                'Discovery notes must be 1000 characters or fewer'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF intake_candidates IS NULL
       OR jsonb_typeof(intake_candidates) <> 'array'
       OR jsonb_array_length(intake_candidates) NOT BETWEEN 1 AND 50
    THEN
        RAISE EXCEPTION
            'Supply between 1 and 50 observed business candidates'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.lead_discovery_runs (
        workspace_id,
        run_name,
        source_type,
        market,
        target_location,
        service_focus,
        notes,
        status,
        created_by
    )
    VALUES (
        check_workspace_id,
        run_name_value,
        'manual_intake',
        market_value,
        location_value,
        service_focus_value,
        notes_value,
        'running',
        actor_user_id
    )
    RETURNING id INTO created_run_id;

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value,
                ordinal_position
            )
    LOOP
        IF jsonb_typeof(supplied_candidate) <> 'object' THEN
            RAISE EXCEPTION 'Each discovery candidate must be an object'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM jsonb_object_keys(supplied_candidate) supplied_key
            WHERE supplied_key NOT IN (
                'company_name',
                'website_url',
                'industry',
                'location',
                'source_url',
                'business_email',
                'business_phone',
                'evidence_notes'
            )
        ) THEN
            RAISE EXCEPTION
                'A discovery candidate contains an unsupported field'
                USING ERRCODE = '22023';
        END IF;

        IF NOT (supplied_candidate ? 'company_name')
           OR jsonb_typeof(
               supplied_candidate -> 'company_name'
           ) <> 'string'
        THEN
            RAISE EXCEPTION 'Every candidate requires a company name'
                USING ERRCODE = '22023';
        END IF;

        company_name_value :=
            btrim(supplied_candidate ->> 'company_name');
        IF char_length(company_name_value) NOT BETWEEN 2 AND 160 THEN
            RAISE EXCEPTION
                'Candidate company names must be 2 to 160 characters'
                USING ERRCODE = '22023';
        END IF;

        normalized_name_value := lower(
            regexp_replace(
                company_name_value,
                '[^[:alnum:]]+',
                '',
                'g'
            )
        );
        IF normalized_name_value = '' THEN
            RAISE EXCEPTION
                'Candidate company name must contain letters or numbers'
                USING ERRCODE = '22023';
        END IF;

        website_url_value := NULL;
        industry_value := NULL;
        candidate_location_value := NULL;
        source_url_value := NULL;
        business_email_value := NULL;
        business_phone_value := NULL;
        evidence_notes_value := NULL;

        IF supplied_candidate ? 'website_url' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'website_url'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate website must be text'
                    USING ERRCODE = '22023';
            END IF;
            website_url_value := NULLIF(
                btrim(supplied_candidate ->> 'website_url'),
                ''
            );
            IF char_length(website_url_value) > 500
               OR website_url_value !~* '^https?://[^[:space:]]+$'
            THEN
                RAISE EXCEPTION
                    'Candidate website must be a valid HTTP(S) URL'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'industry' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'industry'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate industry must be text'
                    USING ERRCODE = '22023';
            END IF;
            industry_value := NULLIF(
                btrim(supplied_candidate ->> 'industry'),
                ''
            );
            IF char_length(industry_value) > 160 THEN
                RAISE EXCEPTION
                    'Candidate industry must be 160 characters or fewer'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'location' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'location'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate location must be text'
                    USING ERRCODE = '22023';
            END IF;
            candidate_location_value := NULLIF(
                btrim(supplied_candidate ->> 'location'),
                ''
            );
            IF char_length(candidate_location_value) > 240 THEN
                RAISE EXCEPTION
                    'Candidate location must be 240 characters or fewer'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'source_url' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'source_url'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate source URL must be text'
                    USING ERRCODE = '22023';
            END IF;
            source_url_value := NULLIF(
                btrim(supplied_candidate ->> 'source_url'),
                ''
            );
            IF char_length(source_url_value) > 500
               OR source_url_value !~* '^https?://[^[:space:]]+$'
            THEN
                RAISE EXCEPTION
                    'Candidate source must be a valid HTTP(S) URL'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'business_email' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'business_email'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate email must be text'
                    USING ERRCODE = '22023';
            END IF;
            business_email_value := NULLIF(
                lower(btrim(supplied_candidate ->> 'business_email')),
                ''
            );
            IF char_length(business_email_value) > 320
               OR business_email_value !~*
                    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
            THEN
                RAISE EXCEPTION 'Candidate email is invalid'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'business_phone' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'business_phone'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate phone must be text'
                    USING ERRCODE = '22023';
            END IF;
            business_phone_value := NULLIF(
                btrim(supplied_candidate ->> 'business_phone'),
                ''
            );
            IF char_length(business_phone_value) > 80 THEN
                RAISE EXCEPTION
                    'Candidate phone must be 80 characters or fewer'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        IF supplied_candidate ? 'evidence_notes' THEN
            IF jsonb_typeof(
                supplied_candidate -> 'evidence_notes'
            ) <> 'string' THEN
                RAISE EXCEPTION 'Candidate evidence notes must be text'
                    USING ERRCODE = '22023';
            END IF;
            evidence_notes_value := NULLIF(
                btrim(supplied_candidate ->> 'evidence_notes'),
                ''
            );
            IF char_length(evidence_notes_value) > 1000 THEN
                RAISE EXCEPTION
                    'Candidate evidence notes must be 1000 characters or fewer'
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        fingerprint_value := md5(
            normalized_name_value
            || '|'
            || lower(
                COALESCE(
                    regexp_replace(
                        website_url_value,
                        '^https?://(www\.)?',
                        '',
                        'i'
                    ),
                    ''
                )
            )
        );

        existing_lead_id := NULL;
        existing_candidate_id := NULL;

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
          ) = normalized_name_value
        ORDER BY lead.created_at
        LIMIT 1;

        IF existing_lead_id IS NULL THEN
            SELECT candidate.id
            INTO existing_candidate_id
            FROM public.lead_discovery_candidates candidate
            WHERE candidate.run_id = created_run_id
              AND candidate.fingerprint = fingerprint_value
            ORDER BY candidate.source_index
            LIMIT 1;
        END IF;

        INSERT INTO public.lead_discovery_candidates (
            run_id,
            workspace_id,
            source_index,
            company_name,
            normalized_name,
            fingerprint,
            website_url,
            industry,
            location,
            source_url,
            business_email,
            business_phone,
            evidence_notes,
            status,
            matched_lead_id,
            duplicate_of_candidate_id
        )
        VALUES (
            created_run_id,
            check_workspace_id,
            source_position,
            company_name_value,
            normalized_name_value,
            fingerprint_value,
            website_url_value,
            industry_value,
            candidate_location_value,
            source_url_value,
            business_email_value,
            business_phone_value,
            evidence_notes_value,
            CASE
                WHEN existing_lead_id IS NOT NULL
                  OR existing_candidate_id IS NOT NULL
                THEN 'duplicate'
                ELSE 'ready'
            END,
            existing_lead_id,
            existing_candidate_id
        );

        total_candidates := total_candidates + 1;
        IF existing_lead_id IS NOT NULL
           OR existing_candidate_id IS NOT NULL
        THEN
            total_duplicates := total_duplicates + 1;
        ELSE
            total_ready := total_ready + 1;
        END IF;
    END LOOP;

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
        created_run_id,
        'discover_leads',
        'completed',
        CASE
            WHEN total_ready >= 10
            THEN 'high'::public.ai_action_priority
            ELSE 'normal'::public.ai_action_priority
        END,
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'run_name',
            run_name_value,
            'source_type',
            'manual_intake',
            'market',
            market_value,
            'location',
            location_value,
            'service_focus',
            service_focus_value,
            'candidate_count',
            total_candidates
        ),
        jsonb_build_object(
            'run_id',
            created_run_id,
            'candidate_count',
            total_candidates,
            'ready_count',
            total_ready,
            'duplicate_count',
            total_duplicates,
            'requires_human_import',
            TRUE
        ),
        discovery_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_action_id;

    UPDATE public.lead_discovery_runs
    SET
        status = 'completed',
        candidate_count = total_candidates,
        ready_count = total_ready,
        duplicate_count = total_duplicates,
        ai_action_id = created_action_id,
        finished_at = clock_timestamp()
    WHERE id = created_run_id
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
        created_run_id,
        'ai_agent',
        NULL,
        actor_member_id,
        discovery_agent_id,
        'lead_discovery_completed',
        jsonb_build_object(
            'ai_action_id',
            created_action_id,
            'run_name',
            run_name_value,
            'candidate_count',
            total_candidates,
            'ready_count',
            total_ready,
            'duplicate_count',
            total_duplicates
        )
    );

    RETURN QUERY
    SELECT
        created_run_id,
        created_action_id,
        total_candidates,
        total_ready,
        total_duplicates;
END;
$$;

REVOKE ALL ON FUNCTION public.run_lead_discovery_intake(
    UUID,
    JSONB,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_lead_discovery_intake(
    UUID,
    JSONB,
    JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_lead_discovery_intake(
    UUID,
    JSONB,
    JSONB
) TO authenticated;

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
