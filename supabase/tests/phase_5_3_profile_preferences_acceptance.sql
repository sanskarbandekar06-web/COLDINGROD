-- Phase 5.3 personal profile, avatar, and personal-workspace guard acceptance test.
-- All synthetic users and data are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error_like(statement TEXT, label TEXT, expected_text TEXT)
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

CREATE OR REPLACE FUNCTION pg_temp.expect_permission_denied(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    PERFORM pg_temp.expect_error_like(statement, label, 'row-level security');
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

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
    ('86111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'profile-owner@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Profile Owner'), now(), now()),
    ('86222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'profile-outsider@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Profile Outsider'), now(), now());

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.buckets
     WHERE id = 'avatars'
       AND public
       AND file_size_limit = 2097152
       AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]) = 1,
    'avatar bucket is public and limited to safe 2 MB image types'
);

SELECT set_config('request.jwt.claim.sub', '86111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'profile-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '86111111-1111-4111-8111-111111111111',
    'email', 'profile-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;

UPDATE public.users
SET full_name = 'Updated Profile Owner',
    job_title = 'Founder',
    timezone = 'Asia/Kolkata',
    locale = 'en-IN',
    email_notifications = false,
    product_updates = true,
    ai_assistance_enabled = false,
    avatar_url = 'https://example.test/avatar.webp',
    avatar_path = '86111111-1111-4111-8111-111111111111/avatar.webp'
WHERE id = '86111111-1111-4111-8111-111111111111';

SELECT pg_temp.assert_true(
    (SELECT full_name = 'Updated Profile Owner'
         AND job_title = 'Founder'
         AND timezone = 'Asia/Kolkata'
         AND locale = 'en-IN'
         AND NOT email_notifications
         AND product_updates
         AND NOT ai_assistance_enabled
     FROM public.users
     WHERE id = '86111111-1111-4111-8111-111111111111'),
    'user can update every own personal preference'
);

SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.users SET full_name = 'Unsafe change'
      WHERE id = '86222222-2222-4222-8222-222222222222'$$,
    'user cannot update another personal profile'
);

SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO storage.objects (bucket_id, name, owner_id)
      VALUES ('avatars', '86222222-2222-4222-8222-222222222222/wrong.webp', '86111111-1111-4111-8111-111111111111')$$,
    'user cannot upload into another avatar folder'
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
    'avatars',
    '86111111-1111-4111-8111-111111111111/avatar.webp',
    '86111111-1111-4111-8111-111111111111',
    jsonb_build_object('mimetype', 'image/webp', 'size', 512)
);

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM storage.objects
     WHERE bucket_id = 'avatars'
       AND name = '86111111-1111-4111-8111-111111111111/avatar.webp') = 1,
    'user can create and read an avatar in own folder'
);

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'avatars_delete_own') = 1,
    'own-avatar deletion policy is installed for Storage API removals'
);

SELECT pg_temp.expect_error_like(
    format(
        $$INSERT INTO public.workspace_invites (workspace_id, email, token, invited_by, expires_at)
          SELECT id, 'blocked@coldingrod.test', 'profile-personal-invite-test',
                 '86111111-1111-4111-8111-111111111111', now() + interval '7 days'
          FROM public.workspaces
          WHERE created_by = '86111111-1111-4111-8111-111111111111'
            AND is_personal$$
    ),
    'personal workspace cannot create invitations',
    'Cannot invite users to a personal workspace'
);

RESET ROLE;

SELECT 'PASS' AS phase_5_3_profile_preferences_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;