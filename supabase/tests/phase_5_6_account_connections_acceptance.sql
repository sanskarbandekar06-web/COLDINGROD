-- Phase 5.6 account-scoped integrations and browser context acceptance test.
-- All synthetic users and data are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition BOOLEAN,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT COALESCE(condition, FALSE) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: %', label;
    END IF;
END;
$fn$;

CREATE TEMP TABLE account_connection_test_context (
    personal_workspace_id UUID,
    team_workspace_id UUID,
    connection_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE
ON account_connection_test_context TO authenticated;

SELECT pg_temp.assert_true(
    to_regclass('public.user_integrations') IS NOT NULL,
    'account integration table exists'
);
SELECT pg_temp.assert_true(
    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.user_integrations'::regclass
    ),
    'account integration table has RLS enabled'
);
SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.set_user_integration_enabled(uuid,integration_provider,boolean)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.ensure_user_integration_workspace(uuid,integration_provider)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.record_user_integration_health(uuid,integration_provider,boolean,text)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.activate_user_workspace_context(uuid)'
    ) IS NOT NULL,
    'account connection RPCs exist'
);
SELECT pg_temp.assert_true(
    NOT has_table_privilege(
        'anon',
        'public.user_integrations',
        'SELECT'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.activate_user_workspace_context(uuid)',
        'EXECUTE'
    ),
    'anonymous users cannot read or mutate account connections'
);

INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES (
    '87611111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'account-connections@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Account Connections'),
    now(),
    now()
);

INSERT INTO account_connection_test_context (personal_workspace_id)
SELECT workspace.id
FROM public.workspaces workspace
WHERE workspace.created_by =
    '87611111-1111-4111-8111-111111111111'
  AND workspace.is_personal;

SELECT set_config(
    'request.jwt.claim.sub',
    '87611111-1111-4111-8111-111111111111',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'account-connections@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '87611111-1111-4111-8111-111111111111',
        'email', 'account-connections@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

UPDATE account_connection_test_context
SET team_workspace_id = public.create_company_workspace(
    'Account Connections Team',
    'account-connections-team'
);

SELECT *
FROM public.set_user_integration_enabled(
    (SELECT personal_workspace_id
     FROM account_connection_test_context),
    'google',
    TRUE
);

INSERT INTO public.browser_extension_connections (
    workspace_id,
    user_id,
    token_hash,
    device_name,
    expires_at
)
SELECT
    personal_workspace_id,
    '87611111-1111-4111-8111-111111111111',
    repeat('b', 64),
    'Account-wide Chrome',
    now() + interval '90 days'
FROM account_connection_test_context
RETURNING id;

UPDATE account_connection_test_context context
SET connection_id = connection.id
FROM public.browser_extension_connections connection
WHERE connection.user_id =
    '87611111-1111-4111-8111-111111111111'
  AND connection.token_hash = repeat('b', 64);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM public.user_integrations connection
        WHERE connection.user_id =
            '87611111-1111-4111-8111-111111111111'
          AND connection.provider = 'google'
          AND connection.status = 'enabled'
    ),
    'Google Places is connected once at account scope'
);

SELECT public.activate_user_workspace_context(
    (SELECT team_workspace_id
     FROM account_connection_test_context)
);

SELECT pg_temp.assert_true(
    (
        SELECT connection.workspace_id = context.team_workspace_id
        FROM public.browser_extension_connections connection
        JOIN account_connection_test_context context
          ON context.connection_id = connection.id
    ),
    'existing browser connection follows the selected workspace'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM public.integrations integration
        JOIN account_connection_test_context context
          ON context.team_workspace_id = integration.workspace_id
        WHERE integration.provider = 'google'
          AND integration.status = 'enabled'
          AND integration.configured_by =
              '87611111-1111-4111-8111-111111111111'
    ),
    'account integration becomes ready in the selected workspace'
);

SELECT public.record_user_integration_health(
    (SELECT team_workspace_id
     FROM account_connection_test_context),
    'google',
    TRUE,
    NULL
);

SELECT pg_temp.assert_true(
    (
        SELECT connection.last_checked_at IS NOT NULL
               AND connection.last_error IS NULL
        FROM public.user_integrations connection
        WHERE connection.user_id =
            '87611111-1111-4111-8111-111111111111'
          AND connection.provider = 'google'
    ),
    'provider health is recorded once for the account'
);

SELECT *
FROM public.set_user_integration_enabled(
    (SELECT team_workspace_id
     FROM account_connection_test_context),
    'google',
    FALSE
);

SELECT pg_temp.assert_true(
    (
        SELECT connection.status = 'disabled'
        FROM public.user_integrations connection
        WHERE connection.user_id =
            '87611111-1111-4111-8111-111111111111'
          AND connection.provider = 'google'
    ),
    'integration can be managed from any accessible workspace'
);

RESET ROLE;
SELECT 'PASS' AS phase_5_6_account_connections_acceptance;
ROLLBACK;