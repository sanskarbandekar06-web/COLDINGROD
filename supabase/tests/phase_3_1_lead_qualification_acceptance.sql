-- Phase 3.1 hosted Lead Qualification Agent acceptance test.
-- All synthetic users, leads, scores, actions, activities, and notifications
-- are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_1_lead_qualification_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE qualification_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    outsider_workspace_id UUID,
    lead_id UUID,
    outsider_lead_id UUID,
    outsider_agent_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON qualification_test_context TO authenticated;

CREATE TEMP TABLE qualification_test_result (
    action_id UUID,
    score_id UUID,
    score INTEGER,
    qualification_band TEXT,
    confidence INTEGER,
    factors JSONB,
    opportunities JSONB
) ON COMMIT DROP;
GRANT SELECT, INSERT ON qualification_test_result TO authenticated;

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

CREATE OR REPLACE FUNCTION pg_temp.expect_permission_denied(
    statement TEXT,
    label TEXT
)
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

CREATE OR REPLACE FUNCTION pg_temp.expect_invalid_parameter(
    statement TEXT,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    rejected BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN invalid_parameter_value THEN
        rejected := true;
    END;
    IF NOT rejected THEN
        RAISE EXCEPTION 'EXPECTED INVALID PARAMETER: %', label;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_check_violation(
    statement TEXT,
    label TEXT
)
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
    to_regprocedure(
        'public.run_lead_qualification(uuid,uuid,jsonb)'
    ) IS NOT NULL,
    'lead qualification RPC exists'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure(
            'public.run_lead_qualification(uuid,uuid,jsonb)'
        )
          AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']
    ),
    'qualification RPC is SECURITY DEFINER with controlled search path'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.run_lead_qualification(uuid,uuid,jsonb)',
        'EXECUTE'
    ),
    'authenticated role may execute qualification RPC'
);
SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'anon',
        'public.run_lead_qualification(uuid,uuid,jsonb)',
        'EXECUTE'
    ),
    'anonymous role cannot execute qualification RPC'
);
SELECT pg_temp.assert_true(
    has_table_privilege('authenticated', 'public.lead_scores', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_scores',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_scores',
        'UPDATE'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_scores',
        'DELETE'
    ),
    'lead score grants are read-only for authenticated clients'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'lead_scores'
    ) = 1,
    'lead scores expose only the active-member select policy'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.lead_scores'::regclass
          AND conname = 'lead_scores_score_range'
    ),
    'lead scores are constrained to 0 through 100'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM public.ai_agents
        WHERE id = '00000000-0000-4000-8000-000000000301'
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ),
    'system Lead Qualification Agent is installed'
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
        '93000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'qualification-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Qualification Owner'),
        now(),
        now()
    ),
    (
        '93000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'qualification-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Qualification Member'),
        now(),
        now()
    ),
    (
        '93000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'qualification-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Qualification Outsider'),
        now(),
        now()
    );

INSERT INTO qualification_test_context (
    workspace_id,
    owner_member_id,
    lead_id,
    outsider_lead_id,
    outsider_agent_id
)
SELECT
    workspace.id,
    member.id,
    '93000000-0000-4000-8000-000000000010',
    '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000012'
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '93000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by = '93000000-0000-4000-8000-000000000001';

UPDATE qualification_test_context context
SET outsider_workspace_id = workspace.id
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by = '93000000-0000-4000-8000-000000000003';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT workspace_id, '93000000-0000-4000-8000-000000000002'
FROM qualification_test_context;

UPDATE qualification_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '93000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM qualification_test_context
        WHERE workspace_id IS NOT NULL
          AND owner_member_id IS NOT NULL
          AND member_id IS NOT NULL
          AND outsider_workspace_id IS NOT NULL
    ) = 1,
    'test workspaces and active members were created'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '93000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'qualification-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '93000000-0000-4000-8000-000000000001',
        'email', 'qualification-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

INSERT INTO public.leads (
    id,
    workspace_id,
    company_name,
    status,
    source
)
SELECT
    lead_id,
    workspace_id,
    'Phase 3 Qualification Test',
    'new',
    'manual_test'
FROM qualification_test_context;

INSERT INTO qualification_test_result
SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM qualification_test_context),
    (SELECT lead_id FROM qualification_test_context),
    jsonb_build_object(
        'website_status', 'none',
        'social_status', 'missing',
        'seo_status', 'weak',
        'google_rating', 3.2,
        'google_review_count', 0,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Observed during acceptance test.'
    )
);

SELECT pg_temp.assert_true(
    (
        SELECT score = 94
           AND qualification_band = 'high_priority'
           AND confidence = 100
           AND jsonb_array_length(factors) = 7
           AND jsonb_array_length(opportunities) >= 5
        FROM qualification_test_result
    ),
    'qualification produces the expected transparent score and factors'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.lead_scores (lead_id, score)
      SELECT lead_id, 50 FROM qualification_test_context$$,
    'even an owner cannot bypass the qualification RPC to insert a score'
);
SELECT pg_temp.expect_permission_denied(
    $$UPDATE public.lead_scores
      SET score = 1
      WHERE id = (SELECT score_id FROM qualification_test_result)$$,
    'even an owner cannot rewrite an agent score'
);
SELECT pg_temp.expect_permission_denied(
    $$DELETE FROM public.lead_scores
      WHERE id = (SELECT score_id FROM qualification_test_result)$$,
    'even an owner cannot delete an agent score'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_qualification(
        (SELECT workspace_id FROM qualification_test_context),
        (SELECT lead_id FROM qualification_test_context),
        '{"website_status":"none","unsupported":true}'::jsonb
    )$$,
    'unknown qualification fields are rejected'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_qualification(
        (SELECT workspace_id FROM qualification_test_context),
        (SELECT lead_id FROM qualification_test_context),
        '{"website_status":"none","social_status":"unknown","seo_status":"unknown"}'::jsonb
    )$$,
    'qualification requires at least three known signals'
);
RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.leads
        WHERE id = (SELECT lead_id FROM qualification_test_context)
          AND status = 'analyzed'
    ) = 1,
    'a new lead advances to analyzed after qualification'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN qualification_test_result result ON result.action_id = action.id
        WHERE action.status = 'completed'
          AND action.action_type = 'qualify_lead'
          AND action.entity_type = 'lead'
          AND action.entity_id = (
              SELECT lead_id FROM qualification_test_context
          )
          AND action.agent_id = '00000000-0000-4000-8000-000000000301'
          AND action.created_by =
              '93000000-0000-4000-8000-000000000001'
          AND action.payload ->> 'evidence_notes' =
              'Observed during acceptance test.'
    ) = 1,
    'completed AI action preserves the actor, lead, and evidence'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_scores score
        JOIN qualification_test_result result ON result.score_id = score.id
        WHERE score.score = 94
          AND score.ai_action_id = result.action_id
          AND score.algorithm_version = 'coldingrod-rules-v1'
    ) = 1,
    'immutable lead score links to its AI action'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN qualification_test_result result
          ON (activity.metadata ->> 'ai_action_id')::UUID = result.action_id
        WHERE activity.entity_type = 'lead'
          AND activity.entity_id = (
              SELECT lead_id FROM qualification_test_context
          )
          AND activity.actor_type = 'ai_agent'
          AND activity.actor_user_id IS NULL
          AND activity.actor_agent_id =
              '00000000-0000-4000-8000-000000000301'
          AND activity.action = 'lead_qualified'
    ) = 1,
    'qualification creates a sanitized AI activity event'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        WHERE activity.entity_id = (
            SELECT lead_id FROM qualification_test_context
        )
          AND activity.action = 'lead_qualified'
    ) = 2,
    'qualification activity notifies both active workspace members'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '93000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'qualification-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '93000000-0000-4000-8000-000000000003',
        'email', 'qualification-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.leads (
    id,
    workspace_id,
    company_name,
    status,
    source
)
SELECT
    outsider_lead_id,
    outsider_workspace_id,
    'Outsider Qualification Test',
    'new',
    'manual_test'
FROM qualification_test_context;
INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    model
)
SELECT
    outsider_agent_id,
    outsider_workspace_id,
    'Outsider Agent',
    'Must not be linked across workspaces.',
    'test-model'
FROM qualification_test_context;
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '93000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'qualification-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '93000000-0000-4000-8000-000000000001',
        'email', 'qualification-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_qualification(
        (SELECT workspace_id FROM qualification_test_context),
        (SELECT outsider_lead_id FROM qualification_test_context),
        '{"website_status":"none","social_status":"missing","seo_status":"weak"}'::jsonb
    )$$,
    'qualification rejects a lead from another workspace'
);
SELECT pg_temp.expect_check_violation(
    $$INSERT INTO public.ai_actions (
        workspace_id, entity_type, entity_id, action_type, payload, agent_id,
        created_by
      )
      SELECT
        workspace_id, 'lead', lead_id, 'cross_workspace_agent_test',
        '{}'::jsonb, outsider_agent_id,
        '93000000-0000-4000-8000-000000000001'
      FROM qualification_test_context$$,
    'AI actions cannot reference another workspace agent'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '93000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'qualification-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '93000000-0000-4000-8000-000000000002',
        'email', 'qualification-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_scores
        WHERE lead_id = (SELECT lead_id FROM qualification_test_context)
    ) = 1,
    'active member may read the workspace qualification'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        WHERE activity.entity_id = (
            SELECT lead_id FROM qualification_test_context
        )
          AND activity.action = 'lead_qualified'
    ) = 1,
    'active member sees only their own qualification notification'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_qualification(
        (SELECT workspace_id FROM qualification_test_context),
        (SELECT lead_id FROM qualification_test_context),
        '{"website_status":"none","social_status":"missing","seo_status":"weak"}'::jsonb
    )$$,
    'member without manage_ai and manage_leads cannot run qualification'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM qualification_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_scores
        WHERE lead_id = (SELECT lead_id FROM qualification_test_context)
    ) = 0,
    'soft-deleted member immediately loses score visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '93000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'qualification-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '93000000-0000-4000-8000-000000000003',
        'email', 'qualification-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_scores
        WHERE lead_id = (SELECT lead_id FROM qualification_test_context)
    ) = 0,
    'workspace outsider cannot see qualification scores'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_qualification(
        (SELECT workspace_id FROM qualification_test_context),
        (SELECT lead_id FROM qualification_test_context),
        '{"website_status":"none","social_status":"missing","seo_status":"weak"}'::jsonb
    )$$,
    'workspace outsider cannot execute qualification in the owner workspace'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_1_lead_qualification_acceptance,
    'all synthetic Phase 3.1 rows will be rolled back' AS cleanup;
ROLLBACK;
