-- Phase 2.9 hosted asset and Storage acceptance test.
-- All synthetic users, metadata, and objects are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_2_9_assets_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE asset_test_context (
    workspace_id UUID
) ON COMMIT DROP;
GRANT SELECT ON asset_test_context TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition BOOLEAN, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT COALESCE(condition, false) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: %', label;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_permission_denied(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    denied BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN insufficient_privilege THEN
        denied := true;
    END;
    IF NOT denied THEN
        RAISE EXCEPTION 'EXPECTED PERMISSION DENIAL: %', label;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_zero_rows(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    affected BIGINT;
BEGIN
    EXECUTE statement;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'EXPECTED ZERO AFFECTED ROWS: %, got %', label, affected;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error_like(
    statement TEXT,
    label TEXT,
    expected_text TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    matched BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF position(lower(expected_text) in lower(SQLERRM)) > 0 THEN
            matched := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT matched THEN
        RAISE EXCEPTION 'EXPECTED ERROR WAS NOT RAISED: %', label;
    END IF;
END;
$fn$;

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'workspace-assets'
          AND public = false
          AND file_size_limit = 26214400
    ),
    'workspace-assets bucket is private with a 25 MB limit'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE 'workspace_assets_%'
    ) = 4,
    'Storage objects have select, insert, update, and delete policies'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'assets'
          AND column_name = 'upload_source'
    ),
    'assets upload_source column exists'
);
SELECT pg_temp.assert_true(
    public.asset_storage_workspace_id(
        '91000000-0000-4000-8000-000000000010/user/file.pdf'
    ) = '91000000-0000-4000-8000-000000000010'::UUID,
    'Storage workspace helper reads the first path segment'
);
SELECT pg_temp.assert_true(
    public.asset_storage_workspace_id('not-a-uuid/user/file.pdf') IS NULL,
    'Storage workspace helper safely rejects invalid paths'
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
) VALUES
    (
        '91000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'asset-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Asset Owner'),
        now(),
        now()
    ),
    (
        '91000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'asset-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Asset Member'),
        now(),
        now()
    ),
    (
        '91000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'asset-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Asset Outsider'),
        now(),
        now()
    );

INSERT INTO asset_test_context (workspace_id)
SELECT id
FROM public.workspaces
WHERE is_personal
  AND created_by = '91000000-0000-4000-8000-000000000001';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT workspace_id, '91000000-0000-4000-8000-000000000002'
FROM asset_test_context;

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM asset_test_context) = 1,
    'owner test workspace exists'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config('request.jwt.claim.email', 'asset-owner@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '91000000-0000-4000-8000-000000000001',
        'email', 'asset-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO storage.objects (bucket_id, name, owner_id)
      SELECT 'workspace-assets',
             workspace_id::TEXT || '/91000000-0000-4000-8000-000000000002/wrong-owner.pdf',
             '91000000-0000-4000-8000-000000000001'
      FROM asset_test_context$$,
    'owner cannot upload into another user folder'
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT
    'workspace-assets',
    workspace_id::TEXT || '/91000000-0000-4000-8000-000000000001/test.pdf',
    '91000000-0000-4000-8000-000000000001',
    jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
FROM asset_test_context;

INSERT INTO public.assets (
    id,
    workspace_id,
    name,
    file_path,
    file_type,
    size_bytes,
    upload_source,
    uploaded_by
)
SELECT
    '91000000-0000-4000-8000-000000000010',
    workspace_id,
    'test.pdf',
    workspace_id::TEXT || '/91000000-0000-4000-8000-000000000001/test.pdf',
    'application/pdf',
    1024,
    'general',
    '91000000-0000-4000-8000-000000000001'
FROM asset_test_context;

SELECT pg_temp.expect_error_like(
    $$INSERT INTO public.assets (
          workspace_id, name, file_path, file_type, size_bytes, uploaded_by
      )
      SELECT workspace_id, 'too-large.pdf',
             workspace_id::TEXT || '/91000000-0000-4000-8000-000000000001/too-large.pdf',
             'application/pdf', 26214401,
             '91000000-0000-4000-8000-000000000001'
      FROM asset_test_context$$,
    'asset size constraint rejects files larger than 25 MB',
    'assets_size_bounds'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.assets WHERE id = '91000000-0000-4000-8000-000000000010') = 1,
    'manager can create and read active asset metadata'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM storage.objects
        WHERE bucket_id = 'workspace-assets'
          AND name LIKE '%/test.pdf'
    ) = 1,
    'manager can read active private object'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config('request.jwt.claim.email', 'asset-member@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '91000000-0000-4000-8000-000000000002',
        'email', 'asset-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.assets WHERE id = '91000000-0000-4000-8000-000000000010') = 1,
    'limited active member can read active asset metadata'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.objects WHERE name LIKE '%/test.pdf') = 1,
    'limited active member can read active private object'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.assets (
          workspace_id, name, file_path, file_type, size_bytes, uploaded_by
      )
      SELECT workspace_id, 'denied.pdf',
             workspace_id::TEXT || '/91000000-0000-4000-8000-000000000002/denied.pdf',
             'application/pdf', 100,
             '91000000-0000-4000-8000-000000000002'
      FROM asset_test_context$$,
    'member without manage_assets cannot insert metadata'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO storage.objects (bucket_id, name, owner_id)
      SELECT 'workspace-assets',
             workspace_id::TEXT || '/91000000-0000-4000-8000-000000000002/denied.pdf',
             '91000000-0000-4000-8000-000000000002'
      FROM asset_test_context$$,
    'member without manage_assets cannot upload objects'
);
SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.assets
      SET name = 'denied-update.pdf'
      WHERE id = '91000000-0000-4000-8000-000000000010'$$,
    'member without manage_assets cannot update metadata'
);

RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config('request.jwt.claim.email', 'asset-owner@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '91000000-0000-4000-8000-000000000001',
        'email', 'asset-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
UPDATE public.assets
SET deleted_at = now()
WHERE id = '91000000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.assets WHERE id = '91000000-0000-4000-8000-000000000010') = 1,
    'manager can read archived asset metadata'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.objects WHERE name LIKE '%/test.pdf') = 1,
    'manager can read archived private object'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config('request.jwt.claim.email', 'asset-member@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '91000000-0000-4000-8000-000000000002',
        'email', 'asset-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.assets WHERE id = '91000000-0000-4000-8000-000000000010') = 0,
    'limited member cannot read archived asset metadata'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.objects WHERE name LIKE '%/test.pdf') = 0,
    'limited member cannot read archived private object'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config('request.jwt.claim.email', 'asset-outsider@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '91000000-0000-4000-8000-000000000003',
        'email', 'asset-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.assets WHERE id = '91000000-0000-4000-8000-000000000010') = 0,
    'outsider cannot read workspace asset metadata'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.objects WHERE name LIKE '%/test.pdf') = 0,
    'outsider cannot read workspace private objects'
);
RESET ROLE;

SELECT 'PASS' AS phase_2_9_assets_acceptance,
       'all synthetic data and Storage rows will be rolled back' AS cleanup;
ROLLBACK;
