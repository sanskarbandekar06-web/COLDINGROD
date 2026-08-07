-- Account-scoped provider and browser-companion connections.
-- A user connects once, then the active workspace follows their dashboard switch.

CREATE TABLE public.user_integrations (
    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    provider public.integration_provider NOT NULL,
    status TEXT NOT NULL DEFAULT 'disabled',
    configured_workspace_id UUID
        REFERENCES public.workspaces(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider),
    CONSTRAINT user_integrations_status_check
        CHECK (status IN (
            'disabled', 'enabled', 'connected', 'disconnected', 'error'
        )),
    CONSTRAINT user_integrations_error_length
        CHECK (last_error IS NULL OR char_length(last_error) <= 500),
    CONSTRAINT user_integrations_metadata_no_credentials
        CHECK (
            NOT (
                metadata ?| ARRAY[
                    'api_key', 'apikey', 'access_token', 'refresh_token',
                    'client_secret', 'password', 'secret', 'token'
                ]
            )
        )
);

CREATE TRIGGER set_updated_at_user_integrations
BEFORE UPDATE ON public.user_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_integrations_select_own"
ON public.user_integrations
FOR SELECT
USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_integrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_integrations TO authenticated;

-- Preserve every existing user connection while moving its scope from one
-- workspace to the signed-in account.
INSERT INTO public.user_integrations (
    user_id,
    provider,
    status,
    configured_workspace_id,
    metadata,
    connected_at,
    disconnected_at,
    last_checked_at,
    last_error,
    created_at,
    updated_at
)
SELECT DISTINCT ON (integration.configured_by, integration.provider)
    integration.configured_by,
    integration.provider,
    integration.status,
    integration.workspace_id,
    COALESCE(integration.metadata, '{}'::JSONB)
        || jsonb_build_object('scope', 'account'),
    integration.connected_at,
    integration.disconnected_at,
    integration.last_checked_at,
    integration.last_error,
    COALESCE(integration.created_at, NOW()),
    COALESCE(integration.updated_at, integration.created_at, NOW())
FROM public.integrations integration
WHERE integration.configured_by IS NOT NULL
ORDER BY
    integration.configured_by,
    integration.provider,
    CASE
        WHEN integration.status IN ('enabled', 'connected') THEN 0
        ELSE 1
    END,
    integration.updated_at DESC NULLS LAST
ON CONFLICT (user_id, provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_user_integration_enabled(
    check_workspace_id UUID,
    check_provider public.integration_provider,
    check_enabled BOOLEAN
)
RETURNS TABLE (
    integration_provider public.integration_provider,
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
    saved_status TEXT;
    saved_updated_at TIMESTAMPTZ;
    workspace_integration_id UUID;
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

    INSERT INTO public.user_integrations (
        user_id,
        provider,
        status,
        configured_workspace_id,
        metadata,
        connected_at,
        disconnected_at,
        last_error
    )
    VALUES (
        actor_user_id,
        check_provider,
        CASE WHEN check_enabled THEN 'enabled' ELSE 'disabled' END,
        check_workspace_id,
        jsonb_build_object(
            'connection_mode', 'server_environment',
            'credentials_stored', FALSE,
            'scope', 'account'
        ),
        CASE WHEN check_enabled THEN NOW() ELSE NULL END,
        CASE WHEN check_enabled THEN NULL ELSE NOW() END,
        NULL
    )
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
        status = EXCLUDED.status,
        configured_workspace_id = EXCLUDED.configured_workspace_id,
        metadata = public.user_integrations.metadata || EXCLUDED.metadata,
        connected_at = CASE
            WHEN check_enabled
            THEN COALESCE(public.user_integrations.connected_at, NOW())
            ELSE public.user_integrations.connected_at
        END,
        disconnected_at = CASE
            WHEN check_enabled THEN NULL
            ELSE NOW()
        END,
        last_error = NULL
    RETURNING status, updated_at
    INTO saved_status, saved_updated_at;

    INSERT INTO public.integrations (
        workspace_id,
        provider,
        status,
        metadata,
        connected_at,
        disconnected_at,
        last_error,
        configured_by
    )
    VALUES (
        check_workspace_id,
        check_provider,
        CASE WHEN check_enabled THEN 'enabled' ELSE 'disabled' END,
        jsonb_build_object(
            'connection_mode', 'server_environment',
            'credentials_stored', FALSE,
            'scope', 'account'
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
    RETURNING id INTO workspace_integration_id;

    INSERT INTO public.activities (
        workspace_id,
        entity_type,
        entity_id,
        actor_type,
        actor_user_id,
        workspace_member_id,
        action,
        metadata
    )
    VALUES (
        check_workspace_id,
        'integration',
        workspace_integration_id,
        'human',
        actor_user_id,
        actor_member_id,
        CASE
            WHEN check_enabled THEN 'integration_enabled_for_account'
            ELSE 'integration_disabled_for_account'
        END,
        jsonb_build_object(
            'provider', check_provider::TEXT,
            'scope', 'account',
            'credentials_stored', FALSE
        )
    );

    RETURN QUERY
    SELECT check_provider, saved_status, saved_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_integration_workspace(
    check_workspace_id UUID,
    check_provider public.integration_provider
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    account_connection public.user_integrations%ROWTYPE;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
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

    SELECT connection.*
    INTO account_connection
    FROM public.user_integrations connection
    WHERE connection.user_id = actor_user_id
      AND connection.provider = check_provider
      AND connection.status IN ('enabled', 'connected');

    IF account_connection.user_id IS NULL THEN
        RAISE EXCEPTION 'Account integration is not enabled'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.integrations (
        workspace_id,
        provider,
        status,
        metadata,
        connected_at,
        disconnected_at,
        last_error,
        configured_by
    )
    VALUES (
        check_workspace_id,
        check_provider,
        'enabled',
        account_connection.metadata
            || jsonb_build_object('inherited_from_account', TRUE),
        COALESCE(account_connection.connected_at, NOW()),
        NULL,
        account_connection.last_error,
        actor_user_id
    )
    ON CONFLICT (workspace_id, provider)
    DO UPDATE SET
        status = 'enabled',
        metadata = COALESCE(public.integrations.metadata, '{}'::JSONB)
            || EXCLUDED.metadata,
        connected_at = COALESCE(public.integrations.connected_at, NOW()),
        disconnected_at = NULL,
        configured_by = actor_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_user_integration_health(
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
    normalized_error TEXT;
    workspace_integration_id UUID;
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

    normalized_error := NULLIF(btrim(COALESCE(check_error, '')), '');
    IF char_length(normalized_error) > 500 THEN
        RAISE EXCEPTION 'Integration error must be 500 characters or fewer'
            USING ERRCODE = '22023';
    END IF;
    IF check_succeeded THEN
        normalized_error := NULL;
    END IF;

    UPDATE public.user_integrations connection
    SET last_checked_at = NOW(),
        last_error = normalized_error
    WHERE connection.user_id = actor_user_id
      AND connection.provider = check_provider
      AND connection.status IN ('enabled', 'connected');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account integration is not enabled'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.ensure_user_integration_workspace(
        check_workspace_id,
        check_provider
    );

    UPDATE public.integrations integration
    SET last_checked_at = NOW(),
        last_error = normalized_error
    WHERE integration.workspace_id = check_workspace_id
      AND integration.provider = check_provider
    RETURNING integration.id INTO workspace_integration_id;

    IF NOT check_succeeded THEN
        INSERT INTO public.activities (
            workspace_id,
            entity_type,
            entity_id,
            actor_type,
            actor_user_id,
            workspace_member_id,
            action,
            metadata
        )
        VALUES (
            check_workspace_id,
            'integration',
            workspace_integration_id,
            'human',
            actor_user_id,
            actor_member_id,
            'integration_check_failed',
            jsonb_build_object(
                'provider', check_provider::TEXT,
                'scope', 'account',
                'error', normalized_error
            )
        );
    END IF;
END;
$$;

-- Browser pairing belongs to the user. workspace_id remains the live context
-- used by the extension RPCs and is changed when the user switches workspace.
DROP POLICY IF EXISTS "browser_extension_connections_select_own"
ON public.browser_extension_connections;
DROP POLICY IF EXISTS "browser_extension_connections_insert_own"
ON public.browser_extension_connections;
DROP POLICY IF EXISTS "browser_extension_connections_update_own"
ON public.browser_extension_connections;
DROP POLICY IF EXISTS "browser_extension_connections_delete_own"
ON public.browser_extension_connections;

CREATE POLICY "browser_extension_connections_select_own"
ON public.browser_extension_connections
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "browser_extension_connections_insert_own"
ON public.browser_extension_connections
FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND public.has_workspace_permission(workspace_id, 'manage_integrations')
);

CREATE POLICY "browser_extension_connections_update_own"
ON public.browser_extension_connections
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_workspace_member(workspace_id)
);

CREATE POLICY "browser_extension_connections_delete_own"
ON public.browser_extension_connections
FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_browser_extension_connections_account_active
    ON public.browser_extension_connections(user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.activate_user_workspace_context(
    check_workspace_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    updated_connections INTEGER := 0;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_active_workspace_member(check_workspace_id) THEN
        RAISE EXCEPTION 'Active workspace membership required'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.browser_extension_connections connection
    SET workspace_id = check_workspace_id
    WHERE connection.user_id = actor_user_id
      AND connection.revoked_at IS NULL
      AND connection.expires_at > clock_timestamp();
    GET DIAGNOSTICS updated_connections = ROW_COUNT;

    INSERT INTO public.integrations (
        workspace_id,
        provider,
        status,
        metadata,
        connected_at,
        disconnected_at,
        last_error,
        configured_by
    )
    SELECT
        check_workspace_id,
        account_connection.provider,
        'enabled',
        account_connection.metadata
            || jsonb_build_object('inherited_from_account', TRUE),
        COALESCE(account_connection.connected_at, NOW()),
        NULL,
        account_connection.last_error,
        actor_user_id
    FROM public.user_integrations account_connection
    WHERE account_connection.user_id = actor_user_id
      AND account_connection.status IN ('enabled', 'connected')
    ON CONFLICT (workspace_id, provider)
    DO UPDATE SET
        status = 'enabled',
        metadata = COALESCE(public.integrations.metadata, '{}'::JSONB)
            || EXCLUDED.metadata,
        connected_at = COALESCE(public.integrations.connected_at, NOW()),
        disconnected_at = NULL,
        configured_by = actor_user_id;

    RETURN updated_connections;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_integration_enabled(
    UUID, public.integration_provider, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_integration_enabled(
    UUID, public.integration_provider, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_user_integration_workspace(
    UUID, public.integration_provider
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_integration_workspace(
    UUID, public.integration_provider
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_user_integration_health(
    UUID, public.integration_provider, BOOLEAN, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_integration_health(
    UUID, public.integration_provider, BOOLEAN, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_user_workspace_context(UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_user_workspace_context(UUID)
TO authenticated;