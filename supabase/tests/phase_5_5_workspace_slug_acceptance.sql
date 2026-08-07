-- Phase 5.5 workspace slug integrity acceptance test.
-- All synthetic users and data are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition BOOLEAN,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT COALESCE(condition, false) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: %', label;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(
    statement TEXT,
    expected_state TEXT,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
    actual_state TEXT;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    END;

    IF actual_state IS DISTINCT FROM expected_state THEN
        RAISE EXCEPTION
            'EXPECTED SQLSTATE % FOR %, GOT %',
            expected_state,
            label,
            COALESCE(actual_state, 'no error');
    END IF;
END;
$function$;

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM public.workspaces
        WHERE char_length(slug) NOT BETWEEN 2 AND 63
           OR slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    'all existing workspace slugs are route-safe'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.workspaces'::regclass
          AND conname = 'workspaces_slug_format_check'
          AND convalidated
    ),
    'workspace slug constraint exists and is validated'
);

SELECT pg_temp.expect_sqlstate(
    $$INSERT INTO public.workspaces (name, slug, is_personal)
      VALUES ('Invalid Slug Test', 'app.invalid.example/', false)$$,
    '23514',
    'database rejects a route-unsafe slug'
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
    '88511111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'slug-owner@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Slug Owner'),
    now(),
    now()
);

SELECT set_config(
    'request.jwt.claim.sub',
    '88511111-1111-4111-8111-111111111111',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'slug-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '88511111-1111-4111-8111-111111111111',
        'email', 'slug-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_sqlstate(
    $$SELECT public.create_company_workspace(
        'Invalid Company',
        'app.invalid.example/'
    )$$,
    '22023',
    'company workspace RPC rejects a URL as its slug'
);

SELECT public.create_company_workspace(
    'Slug Integrity Company',
    'slug-integrity-acceptance-026'
);

RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM public.workspaces workspace
        JOIN public.workspace_members member
          ON member.workspace_id = workspace.id
         AND member.deleted_at IS NULL
        WHERE workspace.slug = 'slug-integrity-acceptance-026'
          AND workspace.created_by =
              '88511111-1111-4111-8111-111111111111'
          AND NOT workspace.is_personal
    ),
    'valid RPC creates a navigable company workspace and owner membership'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = (SELECT count(*) FROM public.permissions)
        FROM public.workspaces workspace
        JOIN public.workspace_members member
          ON member.workspace_id = workspace.id
         AND member.deleted_at IS NULL
        JOIN public.workspace_permissions workspace_permission
          ON workspace_permission.workspace_member_id = member.id
        WHERE workspace.slug = 'slug-integrity-acceptance-026'
    ),
    'company workspace owner receives the complete permission catalog'
);

SELECT 'PASS' AS phase_5_5_workspace_slug_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;
