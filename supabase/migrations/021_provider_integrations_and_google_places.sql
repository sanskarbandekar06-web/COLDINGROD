-- ==========================================
-- 021_provider_integrations_and_google_places.sql
-- Phase 4.1: secure provider lifecycle and Google Places discovery bridge
-- ==========================================

ALTER TABLE public.integrations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS configured_by UUID
        REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.integrations
    ALTER COLUMN status SET DEFAULT 'disabled';

UPDATE public.integrations
SET connected_at = COALESCE(connected_at, created_at, NOW())
WHERE status IN ('connected', 'enabled')
  AND connected_at IS NULL;

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_status_check
        CHECK (status IN (
            'disabled', 'enabled', 'connected', 'disconnected', 'error'
        )),
    ADD CONSTRAINT integrations_error_length
        CHECK (last_error IS NULL OR char_length(last_error) <= 500),
    ADD CONSTRAINT integrations_metadata_no_credentials
        CHECK (
            NOT (
                COALESCE(metadata, '{}'::JSONB) ?| ARRAY[
                    'api_key', 'apikey', 'access_token', 'refresh_token',
                    'client_secret', 'password', 'secret', 'token'
                ]
            )
        );

DROP TRIGGER IF EXISTS set_updated_at_integrations
ON public.integrations;
CREATE TRIGGER set_updated_at_integrations
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_workspace_integration_enabled(
    check_workspace_id UUID,
    check_provider public.integration_provider,
    check_enabled BOOLEAN
)
RETURNS TABLE (
    integration_id UUID,
    integration_status TEXT,
    integration_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    saved_id UUID;
    saved_status TEXT;
    saved_updated_at TIMESTAMPTZ;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;
    IF check_provider IS NULL OR check_enabled IS NULL THEN
        RAISE EXCEPTION 'Provider and enabled state are required'
            USING ERRCODE = '22023';
    END IF;
    IF NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_integrations'
    ) THEN
        RAISE EXCEPTION 'Integration management permission required'
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

    INSERT INTO public.integrations (
        workspace_id, provider, status, metadata, connected_at,
        disconnected_at, last_error, configured_by
    )
    VALUES (
        check_workspace_id,
        check_provider,
        CASE WHEN check_enabled THEN 'enabled' ELSE 'disabled' END,
        jsonb_build_object(
            'connection_mode', 'server_environment',
            'credentials_stored', FALSE
        ),
        CASE WHEN check_enabled THEN NOW() ELSE NULL END,
        CASE WHEN check_enabled THEN NULL ELSE NOW() END,
        NULL,
        actor_user_id
    )
    ON CONFLICT (workspace_id, provider)
    DO UPDATE SET
        status = EXCLUDED.status,
        metadata = COALESCE(public.integrations.metadata, '{}'::JSONB)
            || EXCLUDED.metadata,
        connected_at = CASE
            WHEN check_enabled
            THEN COALESCE(public.integrations.connected_at, NOW())
            ELSE public.integrations.connected_at
        END,
        disconnected_at = CASE
            WHEN check_enabled THEN NULL
            ELSE NOW()
        END,
        last_error = NULL,
        configured_by = actor_user_id
    RETURNING id, status, updated_at
    INTO saved_id, saved_status, saved_updated_at;

    INSERT INTO public.activities (
        workspace_id, entity_type, entity_id, actor_type,
        actor_user_id, workspace_member_id, action, metadata
    )
    VALUES (
        check_workspace_id,
        'integration',
        saved_id,
        'human',
        actor_user_id,
        actor_member_id,
        CASE
            WHEN check_enabled THEN 'integration_enabled'
            ELSE 'integration_disabled'
        END,
        jsonb_build_object(
            'provider', check_provider::TEXT,
            'credentials_stored', FALSE
        )
    );

    RETURN QUERY SELECT saved_id, saved_status, saved_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_integration_health(
    check_workspace_id UUID,
    check_provider public.integration_provider,
    check_succeeded BOOLEAN,
    check_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    saved_id UUID;
    normalized_error TEXT;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;
    IF check_provider IS NULL OR check_succeeded IS NULL THEN
        RAISE EXCEPTION 'Provider and health outcome are required'
            USING ERRCODE = '22023';
    END IF;
    IF NOT (
        public.has_workspace_permission(
            check_workspace_id,
            'manage_integrations'
        )
        OR (
            public.has_workspace_permission(check_workspace_id, 'manage_ai')
            AND public.has_workspace_permission(
                check_workspace_id,
                'manage_leads'
            )
        )
    ) THEN
        RAISE EXCEPTION 'Integration access denied'
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

    normalized_error := NULLIF(btrim(COALESCE(check_error, '')), '');
    IF char_length(normalized_error) > 500 THEN
        RAISE EXCEPTION 'Integration error must be 500 characters or fewer'
            USING ERRCODE = '22023';
    END IF;
    IF check_succeeded THEN
        normalized_error := NULL;
    END IF;

    UPDATE public.integrations integration
    SET
        last_checked_at = NOW(),
        last_error = normalized_error
    WHERE integration.workspace_id = check_workspace_id
      AND integration.provider = check_provider
      AND integration.status IN ('enabled', 'connected')
    RETURNING integration.id INTO saved_id;

    IF saved_id IS NULL THEN
        RAISE EXCEPTION 'Integration is not enabled'
            USING ERRCODE = '22023';
    END IF;

    IF NOT check_succeeded THEN
        INSERT INTO public.activities (
            workspace_id, entity_type, entity_id, actor_type,
            actor_user_id, workspace_member_id, action, metadata
        )
        VALUES (
            check_workspace_id,
            'integration',
            saved_id,
            'human',
            actor_user_id,
            actor_member_id,
            'integration_check_failed',
            jsonb_build_object(
                'provider', check_provider::TEXT,
                'error', normalized_error
            )
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_integration_enabled(
    UUID, public.integration_provider, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_integration_enabled(
    UUID, public.integration_provider, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_workspace_integration_health(
    UUID, public.integration_provider, BOOLEAN, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_workspace_integration_health(
    UUID, public.integration_provider, BOOLEAN, TEXT
) TO authenticated;

ALTER TABLE public.lead_discovery_candidates
    ADD COLUMN IF NOT EXISTS external_provider TEXT,
    ADD COLUMN IF NOT EXISTS external_reference TEXT;

ALTER TABLE public.lead_discovery_candidates
    ADD CONSTRAINT lead_discovery_candidates_external_provider
        CHECK (
            external_provider IS NULL
            OR external_provider IN ('google_places')
        ),
    ADD CONSTRAINT lead_discovery_candidates_external_pair
        CHECK (
            (external_provider IS NULL AND external_reference IS NULL)
            OR (
                external_provider IS NOT NULL
                AND external_reference IS NOT NULL
                AND char_length(external_reference) BETWEEN 1 AND 255
            )
        );

CREATE INDEX idx_discovery_candidates_external_reference
    ON public.lead_discovery_candidates(
        workspace_id, external_provider, external_reference
    )
    WHERE external_reference IS NOT NULL;

CREATE TABLE public.lead_external_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_external_references_provider
        CHECK (provider IN ('google_places')),
    CONSTRAINT lead_external_references_external_id
        CHECK (char_length(external_id) BETWEEN 1 AND 255),
    CONSTRAINT lead_external_references_lead_workspace_fkey
        FOREIGN KEY (lead_id, workspace_id)
        REFERENCES public.leads(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT lead_external_references_provider_id_unique
        UNIQUE (workspace_id, provider, external_id),
    CONSTRAINT lead_external_references_lead_provider_unique
        UNIQUE (lead_id, provider)
);

ALTER TABLE public.lead_external_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_external_references_select"
ON public.lead_external_references
FOR SELECT
USING (public.is_active_workspace_member(workspace_id));

REVOKE ALL PRIVILEGES
ON TABLE public.lead_external_references FROM anon, authenticated;
GRANT SELECT
ON TABLE public.lead_external_references TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_imported_lead_external_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'imported'
       AND NEW.imported_lead_id IS NOT NULL
       AND NEW.external_provider IS NOT NULL
       AND NEW.external_reference IS NOT NULL
    THEN
        INSERT INTO public.lead_external_references (
            workspace_id, lead_id, provider, external_id
        )
        VALUES (
            NEW.workspace_id,
            NEW.imported_lead_id,
            NEW.external_provider,
            NEW.external_reference
        )
        ON CONFLICT (workspace_id, provider, external_id)
        DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
public.capture_imported_lead_external_reference()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_imported_lead_external_reference
AFTER UPDATE OF status, imported_lead_id
ON public.lead_discovery_candidates
FOR EACH ROW
EXECUTE FUNCTION public.capture_imported_lead_external_reference();

CREATE OR REPLACE FUNCTION public.run_google_places_discovery_intake(
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
    actor_user_id UUID := auth.uid();
    supplied_candidate JSONB;
    source_position INTEGER;
    external_reference_value TEXT;
    stripped_candidates JSONB;
    discovery_result RECORD;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_workspace_permission(check_workspace_id, 'manage_ai')
       OR NOT public.has_workspace_permission(
           check_workspace_id,
           'manage_leads'
       )
    THEN
        RAISE EXCEPTION
            'Google Places discovery requires manage_ai and manage_leads'
            USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.integrations integration
        WHERE integration.workspace_id = check_workspace_id
          AND integration.provider = 'google'
          AND integration.status IN ('enabled', 'connected')
    ) THEN
        RAISE EXCEPTION 'Google Places integration is not enabled'
            USING ERRCODE = '22023';
    END IF;
    IF intake_candidates IS NULL
       OR jsonb_typeof(intake_candidates) <> 'array'
       OR jsonb_array_length(intake_candidates) NOT BETWEEN 1 AND 50
    THEN
        RAISE EXCEPTION
            'Supply between 1 and 50 Google Places references'
            USING ERRCODE = '22023';
    END IF;

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        IF jsonb_typeof(supplied_candidate) <> 'object'
           OR NOT (supplied_candidate ? 'external_reference')
           OR jsonb_typeof(
               supplied_candidate -> 'external_reference'
           ) <> 'string'
        THEN
            RAISE EXCEPTION
                'Every Google Places candidate requires a Place ID'
                USING ERRCODE = '22023';
        END IF;
        external_reference_value :=
            btrim(supplied_candidate ->> 'external_reference');
        IF external_reference_value !~ '^[A-Za-z0-9_-]{1,255}$' THEN
            RAISE EXCEPTION 'Google Place ID is invalid'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF (
        SELECT count(DISTINCT candidate ->> 'external_reference')
        FROM jsonb_array_elements(intake_candidates) candidate
    ) <> jsonb_array_length(intake_candidates)
    THEN
        RAISE EXCEPTION 'Google Place IDs must be unique within a run'
            USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_agg(
        candidate_value - 'external_reference'
        ORDER BY ordinal_position
    )
    INTO stripped_candidates
    FROM jsonb_array_elements(intake_candidates)
        WITH ORDINALITY AS candidate_rows(
            candidate_value, ordinal_position
        );

    SELECT *
    INTO discovery_result
    FROM public.run_lead_discovery_intake(
        check_workspace_id,
        intake_brief,
        stripped_candidates
    );

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        UPDATE public.lead_discovery_candidates candidate
        SET
            external_provider = 'google_places',
            external_reference =
                btrim(supplied_candidate ->> 'external_reference')
        WHERE candidate.run_id = discovery_result.run_id
          AND candidate.workspace_id = check_workspace_id
          AND candidate.source_index = source_position;
    END LOOP;

    UPDATE public.lead_discovery_runs
    SET source_type = 'google_places'
    WHERE id = discovery_result.run_id
      AND workspace_id = check_workspace_id;

    UPDATE public.ai_actions
    SET
        payload = payload || jsonb_build_object(
            'source_type', 'google_places',
            'provider', 'google',
            'persisted_provider_fields', jsonb_build_array('place_id')
        ),
        result_data = result_data || jsonb_build_object(
            'provider_reference_count',
                jsonb_array_length(intake_candidates),
            'places_content_persisted', FALSE
        )
    WHERE id = discovery_result.action_id
      AND workspace_id = check_workspace_id;

    UPDATE public.activities
    SET metadata = COALESCE(metadata, '{}'::JSONB)
        || jsonb_build_object(
            'source_type', 'google_places',
            'provider', 'google'
        )
    WHERE workspace_id = check_workspace_id
      AND entity_type = 'lead_discovery_run'
      AND entity_id = discovery_result.run_id
      AND metadata ->> 'ai_action_id' =
          discovery_result.action_id::TEXT;

    RETURN QUERY SELECT
        discovery_result.run_id,
        discovery_result.action_id,
        discovery_result.candidate_count,
        discovery_result.ready_count,
        discovery_result.duplicate_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_google_places_discovery_intake(
    UUID, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_google_places_discovery_intake(
    UUID, JSONB, JSONB
) TO authenticated;
