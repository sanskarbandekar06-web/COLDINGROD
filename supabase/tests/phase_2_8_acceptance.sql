-- Phase 2.8 hosted acceptance test.
-- All synthetic users and data are rolled back. Run only against a linked test project:
-- npx supabase db query --linked --file supabase/tests/phase_2_8_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    outsider_personal_member_id UUID
) ON COMMIT DROP;
GRANT SELECT ON test_context TO authenticated, anon;

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

-- Synthetic Auth users exercise the on_auth_user_created trigger.
INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
    ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'matrix-owner@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Matrix Owner'), now(), now()),
    ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'matrix-member@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Matrix Member'), now(), now()),
    ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'matrix-outsider@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Matrix Outsider'), now(), now());

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.users WHERE email LIKE 'matrix-%@coldingrod.test') = 3,
    'auth trigger creates public users'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspaces WHERE is_personal AND created_by IN (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
    )) = 3,
    'auth trigger creates one personal workspace per user'
);
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        JOIN public.workspaces w ON w.id = wm.workspace_id
        WHERE w.is_personal
          AND w.created_by IN (
              '11111111-1111-4111-8111-111111111111',
              '22222222-2222-4222-8222-222222222222',
              '33333333-3333-4333-8333-333333333333'
          )
          AND (SELECT count(*) FROM public.workspace_permissions wp WHERE wp.workspace_member_id = wm.id) <> 12
    ),
    'personal workspace owners receive all permissions'
);

-- Owner creates a company workspace through the atomic SECURITY DEFINER RPC.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'matrix-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'matrix-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT public.create_company_workspace('Matrix Company', 'codex-matrix-acceptance');
RESET ROLE;

INSERT INTO test_context (workspace_id, owner_member_id)
SELECT w.id, wm.id
FROM public.workspaces w
JOIN public.workspace_members wm ON wm.workspace_id = w.id
WHERE w.slug = 'codex-matrix-acceptance'
  AND wm.user_id = '11111111-1111-4111-8111-111111111111';

UPDATE test_context
SET outsider_personal_member_id = (
    SELECT wm.id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE w.is_personal
      AND wm.user_id = '33333333-3333-4333-8333-333333333333'
);
SELECT pg_temp.assert_true((SELECT count(*) FROM test_context) = 1, 'company workspace RPC creates workspace and owner membership');
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions wp WHERE wp.workspace_member_id = (SELECT owner_member_id FROM test_context)) = 12,
    'company workspace owner receives all permissions'
);

-- Owner profile setup and first invitation.
SET LOCAL ROLE authenticated;
INSERT INTO public.companies (workspace_id, legal_name)
SELECT workspace_id, 'Matrix Company LLC' FROM test_context;
INSERT INTO public.workspace_invites (
    workspace_id, email, token, granted_permissions, invited_by, expires_at
)
SELECT workspace_id, 'matrix-member@coldingrod.test', 'matrix-invite-1', jsonb_build_array('manage_clients'),
       '11111111-1111-4111-8111-111111111111', now() + interval '1 hour'
FROM test_context;
RESET ROLE;

-- Outsider cannot accept another user's invitation.
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.email', 'matrix-outsider@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '33333333-3333-4333-8333-333333333333',
    'email', 'matrix-outsider@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error_like(
    $$SELECT public.accept_workspace_invite('matrix-invite-1')$$,
    'invite email mismatch',
    'does not match'
);
RESET ROLE;

-- Correct invitee accepts and receives only manage_clients.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.email', 'matrix-member@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '22222222-2222-4222-8222-222222222222',
    'email', 'matrix-member@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT public.accept_workspace_invite('matrix-invite-1');
RESET ROLE;

UPDATE test_context tc
SET member_id = wm.id
FROM public.workspace_members wm
WHERE wm.workspace_id = tc.workspace_id
  AND wm.user_id = '22222222-2222-4222-8222-222222222222'
  AND wm.deleted_at IS NULL;

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions wp JOIN public.permissions p ON p.id = wp.permission_id
     WHERE wp.workspace_member_id = (SELECT member_id FROM test_context) AND p.key = 'manage_clients') = 1,
    'first invite grants manage_clients'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions WHERE workspace_member_id = (SELECT member_id FROM test_context)) = 1,
    'first invite grants no extra permissions'
);

-- Owner seeds one representative row for every workspace domain through RLS.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'matrix-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'matrix-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
INSERT INTO public.ai_agents (id, workspace_id, name, model)
SELECT '41000000-0000-4000-8000-000000000001', workspace_id, 'Matrix Agent', 'test-model' FROM test_context;
INSERT INTO public.ai_actions (id, workspace_id, entity_type, action_type, payload, agent_id, created_by)
SELECT '41000000-0000-4000-8000-000000000002', workspace_id, 'workspace', 'matrix_test', jsonb_build_object(),
       '41000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111' FROM test_context;
INSERT INTO public.ai_approvals (id, ai_action_id, workspace_id, approver_id, decision)
SELECT '41000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000002', workspace_id,
       '11111111-1111-4111-8111-111111111111', 'approved' FROM test_context;
INSERT INTO public.integrations (id, workspace_id, provider, status)
SELECT '41000000-0000-4000-8000-000000000004', workspace_id, 'google', 'connected' FROM test_context;
INSERT INTO public.clients (id, workspace_id, name)
SELECT '42000000-0000-4000-8000-000000000001', workspace_id, 'Matrix Client' FROM test_context;
INSERT INTO public.leads (id, workspace_id, company_name)
SELECT '42000000-0000-4000-8000-000000000002', workspace_id, 'Matrix Lead' FROM test_context;
INSERT INTO public.lead_scores (id, lead_id, score)
VALUES ('42000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', 85);
INSERT INTO public.lead_contacts (id, lead_id, first_name, email)
VALUES ('42000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000002', 'Matrix', 'contact@coldingrod.test');
INSERT INTO public.outreach_messages (id, workspace_id, lead_id, contact_id, platform, direction, content)
SELECT '42000000-0000-4000-8000-000000000005', workspace_id, '42000000-0000-4000-8000-000000000002',
       '42000000-0000-4000-8000-000000000004', 'email', 'outbound', 'Matrix message' FROM test_context;
INSERT INTO public.message_versions (id, outreach_message_id, content, edited_by, version_number)
VALUES ('42000000-0000-4000-8000-000000000006', '42000000-0000-4000-8000-000000000005', 'Matrix message',
        '11111111-1111-4111-8111-111111111111', 1);
INSERT INTO public.projects (id, workspace_id, client_id, name, owner_id)
SELECT '43000000-0000-4000-8000-000000000001', workspace_id, '42000000-0000-4000-8000-000000000001',
       'Matrix Project', '11111111-1111-4111-8111-111111111111' FROM test_context;
INSERT INTO public.tasks (id, workspace_id, project_id, title, assigned_to)
SELECT '43000000-0000-4000-8000-000000000002', workspace_id, '43000000-0000-4000-8000-000000000001',
       'Matrix Task', '22222222-2222-4222-8222-222222222222' FROM test_context;
INSERT INTO public.assets (id, workspace_id, name, file_path, file_type, size_bytes, uploaded_by)
SELECT '43000000-0000-4000-8000-000000000003', workspace_id, 'Matrix Asset', '/matrix/test.txt', 'text/plain', 10,
       '11111111-1111-4111-8111-111111111111' FROM test_context;
RESET ROLE;

-- Active limited member can read every workspace domain but writes only clients.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.email', 'matrix-member@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '22222222-2222-4222-8222-222222222222',
    'email', 'matrix-member@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.workspaces WHERE id = (SELECT workspace_id FROM test_context)) = 1, 'limited member reads workspace');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.companies WHERE workspace_id = (SELECT workspace_id FROM test_context)) = 1, 'limited member reads company');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.ai_agents WHERE id = '41000000-0000-4000-8000-000000000001') = 1, 'limited member reads AI agent');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.ai_actions WHERE id = '41000000-0000-4000-8000-000000000002') = 1, 'limited member reads AI action');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.ai_approvals WHERE id = '41000000-0000-4000-8000-000000000003') = 1, 'limited member reads AI approval');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.integrations WHERE id = '41000000-0000-4000-8000-000000000004') = 1, 'limited member reads integration');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.clients WHERE id = '42000000-0000-4000-8000-000000000001') = 1, 'limited member reads client');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.leads WHERE id = '42000000-0000-4000-8000-000000000002') = 1, 'limited member reads lead');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.lead_scores WHERE id = '42000000-0000-4000-8000-000000000003') = 1, 'limited member reads lead score');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.lead_contacts WHERE id = '42000000-0000-4000-8000-000000000004') = 1, 'limited member reads lead contact');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.outreach_messages WHERE id = '42000000-0000-4000-8000-000000000005') = 1, 'limited member reads outreach');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.message_versions WHERE id = '42000000-0000-4000-8000-000000000006') = 1, 'limited member reads message version');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects WHERE id = '43000000-0000-4000-8000-000000000001') = 1, 'limited member reads project');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.tasks WHERE id = '43000000-0000-4000-8000-000000000002') = 1, 'limited member reads task');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.assets WHERE id = '43000000-0000-4000-8000-000000000003') = 1, 'limited member reads asset');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.permissions) = 12, 'authenticated member reads permission catalog');

INSERT INTO public.clients (id, workspace_id, name)
SELECT '42000000-0000-4000-8000-000000000010', workspace_id, 'Member Managed Client' FROM test_context;
UPDATE public.clients SET name = 'Member Updated Client' WHERE id = '42000000-0000-4000-8000-000000000010';
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.leads (id, workspace_id, company_name) SELECT '42000000-0000-4000-8000-000000000011', workspace_id, 'Denied Lead' FROM test_context$$,
    'manage_clients cannot insert lead'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.ai_agents (id, workspace_id, name, model) SELECT '41000000-0000-4000-8000-000000000011', workspace_id, 'Denied Agent', 'test' FROM test_context$$,
    'manage_clients cannot insert AI agent'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.integrations (id, workspace_id, provider, status) SELECT '41000000-0000-4000-8000-000000000012', workspace_id, 'slack', 'connected' FROM test_context$$,
    'manage_clients cannot insert integration'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.projects (id, workspace_id, name) SELECT '43000000-0000-4000-8000-000000000011', workspace_id, 'Denied Project' FROM test_context$$,
    'manage_clients cannot insert project'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.tasks (id, workspace_id, project_id, title) SELECT '43000000-0000-4000-8000-000000000012', workspace_id, '43000000-0000-4000-8000-000000000001', 'Denied Task' FROM test_context$$,
    'manage_clients cannot insert task'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.assets (id, workspace_id, name, file_path, file_type, size_bytes) SELECT '43000000-0000-4000-8000-000000000013', workspace_id, 'Denied Asset', '/denied', 'text/plain', 1 FROM test_context$$,
    'manage_clients cannot insert asset'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.meetings (id, workspace_id, title) SELECT '44000000-0000-4000-8000-000000000011', workspace_id, 'Denied Meeting' FROM test_context$$,
    'manage_clients cannot insert meeting'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.workspace_invites (workspace_id, email, token, invited_by, expires_at) SELECT workspace_id, 'nobody@coldingrod.test', 'denied-invite', '22222222-2222-4222-8222-222222222222', now() + interval '1 hour' FROM test_context$$,
    'manage_clients cannot invite members'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.workspaces (name, slug, created_by) VALUES ('Orphan', 'orphan-denied', '22222222-2222-4222-8222-222222222222')$$,
    'direct workspace insert is blocked'
);
SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.companies SET legal_name = 'Denied Update' WHERE workspace_id = (SELECT workspace_id FROM test_context)$$,
    'manage_clients cannot update company settings'
);
RESET ROLE;

-- Owner self-protection and atomic member removal.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'matrix-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'matrix-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error_like(
    $$SELECT public.set_workspace_member_permissions((SELECT owner_member_id FROM test_context), ARRAY[]::UUID[])$$,
    'owner cannot remove own manage_members',
    'cannot remove your own manage_members'
);
SELECT pg_temp.expect_error_like(
    $$SELECT public.remove_workspace_member((SELECT owner_member_id FROM test_context))$$,
    'owner cannot remove own membership',
    'cannot remove your own workspace membership'
);
SELECT public.remove_workspace_member((SELECT member_id FROM test_context));
RESET ROLE;

SELECT pg_temp.assert_true(
    (SELECT deleted_at IS NOT NULL FROM public.workspace_members WHERE id = (SELECT member_id FROM test_context)),
    'member removal soft deletes membership'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions WHERE workspace_member_id = (SELECT member_id FROM test_context)) = 0,
    'member removal clears permissions'
);

-- Simulate a legacy stale permission on the deleted membership, then restore.
INSERT INTO public.workspace_permissions (workspace_member_id, permission_id, assigned_by)
SELECT (SELECT member_id FROM test_context), p.id, '11111111-1111-4111-8111-111111111111'
FROM public.permissions p
WHERE p.key = 'manage_ai';

SET LOCAL ROLE authenticated;
INSERT INTO public.workspace_invites (
    workspace_id, email, token, granted_permissions, invited_by, expires_at
)
SELECT workspace_id, 'matrix-member@coldingrod.test', 'matrix-invite-2', jsonb_build_array('manage_meetings'),
       '11111111-1111-4111-8111-111111111111', now() + interval '1 hour'
FROM test_context;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.email', 'matrix-member@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '22222222-2222-4222-8222-222222222222',
    'email', 'matrix-member@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.workspaces WHERE id = (SELECT workspace_id FROM test_context)) = 0, 'removed member cannot read workspace');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.clients WHERE id = '42000000-0000-4000-8000-000000000001') = 0, 'removed member cannot read clients');
SELECT public.accept_workspace_invite('matrix-invite-2');
RESET ROLE;

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_members wm WHERE wm.workspace_id = (SELECT workspace_id FROM test_context)
      AND wm.user_id = '22222222-2222-4222-8222-222222222222') = 1,
    'invite restoration reuses the deleted membership'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions wp JOIN public.permissions p ON p.id = wp.permission_id
     WHERE wp.workspace_member_id = (SELECT member_id FROM test_context) AND p.key = 'manage_meetings') = 1,
    'restored member receives new invite permission'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.workspace_permissions WHERE workspace_member_id = (SELECT member_id FROM test_context)) = 1,
    'restoration clears stale permissions'
);

-- Meeting organizer, participants, archive access, and availability overlap.
SET LOCAL ROLE authenticated;
INSERT INTO public.meetings (
    id, workspace_id, organizer_id, title, status, start_time, end_time
)
SELECT '44000000-0000-4000-8000-000000000001', workspace_id, member_id, 'Matrix Meeting', 'scheduled',
       now() + interval '1 day', now() + interval '1 day 1 hour'
FROM test_context;
INSERT INTO public.meeting_participants (meeting_id, workspace_id, workspace_member_id)
SELECT '44000000-0000-4000-8000-000000000001', workspace_id, member_id FROM test_context;
INSERT INTO public.meeting_participants (meeting_id, workspace_id, workspace_member_id)
SELECT '44000000-0000-4000-8000-000000000001', workspace_id, owner_member_id FROM test_context;
SELECT pg_temp.expect_zero_rows(
    $$DELETE FROM public.meeting_participants WHERE meeting_id = '44000000-0000-4000-8000-000000000001' AND workspace_member_id = (SELECT member_id FROM test_context)$$,
    'organizer participant cannot be removed'
);
INSERT INTO public.availability_slots (id, workspace_id, workspace_member_id, start_time, end_time)
SELECT '44000000-0000-4000-8000-000000000002', workspace_id, member_id,
       now() + interval '2 days', now() + interval '2 days 2 hours'
FROM test_context;
SELECT pg_temp.expect_error_like(
    $$INSERT INTO public.availability_slots (id, workspace_id, workspace_member_id, start_time, end_time) SELECT '44000000-0000-4000-8000-000000000003', workspace_id, member_id, now() + interval '2 days 1 hour', now() + interval '2 days 3 hours' FROM test_context$$,
    'overlapping availability is rejected',
    'availability_slots_no_overlap'
);
UPDATE public.meetings SET deleted_at = now() WHERE id = '44000000-0000-4000-8000-000000000001';
RESET ROLE;

-- Owner cannot assign an organizer from another workspace.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'matrix-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'matrix-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error_like(
    $$INSERT INTO public.meetings (id, workspace_id, organizer_id, title) SELECT '44000000-0000-4000-8000-000000000004', workspace_id, outsider_personal_member_id, 'Bad Organizer' FROM test_context$$,
    'cross-workspace organizer is rejected',
    'Organizer must be an active workspace member'
);
SELECT public.set_workspace_member_permissions(
    (SELECT member_id FROM test_context),
    ARRAY[(SELECT id FROM public.permissions WHERE key = 'manage_clients')]
);
RESET ROLE;

-- Restored limited member cannot see archived meetings without manage_meetings.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.email', 'matrix-member@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '22222222-2222-4222-8222-222222222222',
    'email', 'matrix-member@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.meetings WHERE id = '44000000-0000-4000-8000-000000000001') = 0, 'limited member cannot read archived meeting');
SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.meetings SET title = 'Denied Update' WHERE id = '44000000-0000-4000-8000-000000000001'$$,
    'limited member cannot update meeting'
);
RESET ROLE;

-- Outsider sees no workspace data and cannot write, but can read the permission catalog.
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.email', 'matrix-outsider@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '33333333-3333-4333-8333-333333333333',
    'email', 'matrix-outsider@coldingrod.test',
    'role', 'authenticated'
)::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.workspaces WHERE id = (SELECT workspace_id FROM test_context)) = 0, 'outsider cannot read workspace');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.clients WHERE id = '42000000-0000-4000-8000-000000000001') = 0, 'outsider cannot read client');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.leads WHERE id = '42000000-0000-4000-8000-000000000002') = 0, 'outsider cannot read lead');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects WHERE id = '43000000-0000-4000-8000-000000000001') = 0, 'outsider cannot read project');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.ai_agents WHERE id = '41000000-0000-4000-8000-000000000001') = 0, 'outsider cannot read workspace AI agent');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.permissions) = 12, 'outsider authenticated user can read permission catalog');
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.clients (id, workspace_id, name) VALUES ('42000000-0000-4000-8000-000000000020', (SELECT workspace_id FROM test_context), 'Outsider Client')$$,
    'outsider cannot insert client'
);
RESET ROLE;

-- Anonymous sessions have no public-table grants.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(auth.uid() IS NULL, 'anonymous auth context has no user id');
SELECT pg_temp.expect_permission_denied($$SELECT count(*) FROM public.workspaces$$, 'anonymous cannot read workspaces');
SELECT pg_temp.expect_permission_denied($$SELECT count(*) FROM public.permissions$$, 'anonymous cannot read permission catalog');
RESET ROLE;

SELECT 'PASS' AS phase_2_8_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;
