-- Phase 2.10 hosted Activity Center and Notifications acceptance test.
-- All synthetic users, activities, and notifications are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_2_10_notifications_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE notification_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    owner_notification_id UUID,
    member_notification_id UUID
) ON COMMIT DROP;
GRANT SELECT ON notification_test_context TO authenticated;

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

CREATE OR REPLACE FUNCTION pg_temp.expect_check_violation(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    rejected BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN check_violation THEN
        rejected := true;
    END;
    IF NOT rejected THEN
        RAISE EXCEPTION 'EXPECTED CHECK VIOLATION: %', label;
    END IF;
END;
$fn$;

SELECT pg_temp.assert_true(
    to_regclass('public.notifications') IS NOT NULL,
    'notifications table exists'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'notifications'
    ) = 2,
    'notifications expose only own select and update policies'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ),
    'notifications are published for Realtime refresh'
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
        '92000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'notification-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Notification Owner'),
        now(),
        now()
    ),
    (
        '92000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'notification-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Notification Member'),
        now(),
        now()
    ),
    (
        '92000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'notification-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Notification Outsider'),
        now(),
        now()
    );

INSERT INTO notification_test_context (workspace_id, owner_member_id)
SELECT workspace.id, member.id
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '92000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by = '92000000-0000-4000-8000-000000000001';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT workspace_id, '92000000-0000-4000-8000-000000000002'
FROM notification_test_context;

UPDATE notification_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '92000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM notification_test_context WHERE member_id IS NOT NULL) = 1,
    'test workspace has two active members'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '92000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config('request.jwt.claim.email', 'notification-owner@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '92000000-0000-4000-8000-000000000001',
        'email', 'notification-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

INSERT INTO public.activities (
    id,
    workspace_id,
    entity_type,
    entity_id,
    actor_type,
    actor_user_id,
    action,
    metadata
)
SELECT
    '92000000-0000-4000-8000-000000000010',
    workspace_id,
    'project',
    '92000000-0000-4000-8000-000000000020',
    'human',
    '92000000-0000-4000-8000-000000000001',
    'created',
    jsonb_build_object('safe', true)
FROM notification_test_context;

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications) = 1,
    'owner can see only their own delivered notification'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE is_read = false) = 1,
    'new notification begins unread'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.notifications (workspace_id, workspace_member_id, activity_id)
      SELECT workspace_id, owner_member_id, '92000000-0000-4000-8000-000000000010'
      FROM notification_test_context$$,
    'authenticated clients cannot create notification rows'
);
SELECT pg_temp.expect_permission_denied(
    $$UPDATE public.notifications
      SET activity_id = '92000000-0000-4000-8000-000000000010'$$,
    'authenticated clients cannot relink notification rows'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.activities (
          workspace_id, entity_type, entity_id, actor_type, actor_user_id, action
      )
      SELECT workspace_id, 'project', gen_random_uuid(), 'human',
             '92000000-0000-4000-8000-000000000002', 'spoofed'
      FROM notification_test_context$$,
    'activity insert policy rejects a spoofed human actor'
);
SELECT pg_temp.expect_check_violation(
    $$UPDATE public.notifications SET is_read = true WHERE is_read = false$$,
    'read state requires a matching read timestamp'
);

UPDATE public.notifications
SET is_read = true, read_at = now()
WHERE activity_id = '92000000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE is_read AND read_at IS NOT NULL) = 1,
    'owner can mark own notification read'
);
UPDATE public.notifications
SET is_read = false, read_at = NULL
WHERE activity_id = '92000000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE is_read = false AND read_at IS NULL) = 1,
    'owner can mark own notification unread'
);
RESET ROLE;

UPDATE notification_test_context context
SET owner_notification_id = notification.id
FROM public.notifications notification
WHERE notification.activity_id = '92000000-0000-4000-8000-000000000010'
  AND notification.workspace_member_id = context.owner_member_id;
UPDATE notification_test_context context
SET member_notification_id = notification.id
FROM public.notifications notification
WHERE notification.activity_id = '92000000-0000-4000-8000-000000000010'
  AND notification.workspace_member_id = context.member_id;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE activity_id = '92000000-0000-4000-8000-000000000010') = 2,
    'delivery trigger creates one notification for each active member'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '92000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config('request.jwt.claim.email', 'notification-member@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '92000000-0000-4000-8000-000000000002',
        'email', 'notification-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications) = 1,
    'second member sees only their own notification'
);
SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.notifications
      SET is_read = true, read_at = now()
      WHERE id = (SELECT owner_notification_id FROM notification_test_context)$$,
    'member cannot update another recipient notification'
);
UPDATE public.notifications
SET is_read = true, read_at = now()
WHERE id = (SELECT member_notification_id FROM notification_test_context);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE is_read) = 1,
    'member can update their own read state'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = now()
WHERE id = (SELECT member_id FROM notification_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE workspace_id = (SELECT workspace_id FROM notification_test_context)) = 0,
    'inactive member loses notification access immediately'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.activities WHERE workspace_id = (SELECT workspace_id FROM notification_test_context)) = 0,
    'inactive member also loses activity access'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '92000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config('request.jwt.claim.email', 'notification-owner@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '92000000-0000-4000-8000-000000000001',
        'email', 'notification-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.activities (
    id, workspace_id, entity_type, entity_id, actor_type, actor_user_id, action
)
SELECT
    '92000000-0000-4000-8000-000000000011',
    workspace_id,
    'task',
    '92000000-0000-4000-8000-000000000021',
    'human',
    '92000000-0000-4000-8000-000000000001',
    'updated'
FROM notification_test_context;
RESET ROLE;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE activity_id = '92000000-0000-4000-8000-000000000011') = 1,
    'delivery excludes soft-deleted members'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '92000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config('request.jwt.claim.email', 'notification-outsider@coldingrod.test', true);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '92000000-0000-4000-8000-000000000003',
        'email', 'notification-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.notifications WHERE workspace_id = (SELECT workspace_id FROM notification_test_context)) = 0,
    'workspace outsider cannot see notification rows'
);
RESET ROLE;

SELECT 'PASS' AS phase_2_10_notifications_acceptance,
       'all synthetic activity and notification rows will be rolled back' AS cleanup;
ROLLBACK;