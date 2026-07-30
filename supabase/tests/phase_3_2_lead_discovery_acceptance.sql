-- Phase 3.2 hosted Lead Discovery Agent acceptance test.
-- All synthetic users, runs, candidates, leads, actions, activities, and
-- notifications are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_2_lead_discovery_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE discovery_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    outsider_workspace_id UUID,
    existing_lead_id UUID,
    run_id UUID,
    discovery_action_id UUID,
    ready_candidate_id UUID,
    duplicate_lead_candidate_id UUID,
    duplicate_batch_candidate_id UUID,
    import_action_id UUID,
    imported_lead_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON discovery_test_context TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition BOOLEAN,
    label TEXT
)
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

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.run_lead_discovery_intake(uuid,jsonb,jsonb)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.import_lead_discovery_candidates(uuid,uuid,uuid[])'
    ) IS NOT NULL,
    'discovery and import RPCs exist'
);
SELECT pg_temp.assert_true(
    NOT has_function_privilege(
        'anon',
        'public.run_lead_discovery_intake(uuid,jsonb,jsonb)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.run_lead_discovery_intake(uuid,jsonb,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.import_lead_discovery_candidates(uuid,uuid,uuid[])',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.import_lead_discovery_candidates(uuid,uuid,uuid[])',
        'EXECUTE'
    ),
    'only authenticated clients can execute discovery RPCs'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_proc procedure
        WHERE procedure.oid IN (
            to_regprocedure(
                'public.run_lead_discovery_intake(uuid,jsonb,jsonb)'
            ),
            to_regprocedure(
                'public.import_lead_discovery_candidates(uuid,uuid,uuid[])'
            )
        )
          AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']
    ) = 2,
    'both RPCs are security definer with a controlled search path'
);
SELECT pg_temp.assert_true(
    has_table_privilege(
        'authenticated',
        'public.lead_discovery_runs',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_discovery_runs',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_discovery_runs',
        'UPDATE'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_discovery_runs',
        'DELETE'
    )
    AND has_table_privilege(
        'authenticated',
        'public.lead_discovery_candidates',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_discovery_candidates',
        'INSERT'
    ),
    'discovery tables are read-only to authenticated clients'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'lead_discovery_runs',
              'lead_discovery_candidates'
          )
    ) = 2,
    'discovery tables expose select-only active-member policies'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM public.ai_agents
        WHERE id = '00000000-0000-4000-8000-000000000302'
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ),
    'system Lead Discovery Agent is installed'
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
        '94000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'discovery-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Discovery Owner'),
        now(),
        now()
    ),
    (
        '94000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'discovery-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Discovery Member'),
        now(),
        now()
    ),
    (
        '94000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'discovery-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Discovery Outsider'),
        now(),
        now()
    );

INSERT INTO discovery_test_context (
    workspace_id,
    owner_member_id,
    existing_lead_id
)
SELECT
    workspace.id,
    member.id,
    '94000000-0000-4000-8000-000000000010'
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '94000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by = '94000000-0000-4000-8000-000000000001';

UPDATE discovery_test_context context
SET outsider_workspace_id = workspace.id
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by = '94000000-0000-4000-8000-000000000003';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT workspace_id, '94000000-0000-4000-8000-000000000002'
FROM discovery_test_context;

UPDATE discovery_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '94000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM discovery_test_context
        WHERE workspace_id IS NOT NULL
          AND owner_member_id IS NOT NULL
          AND member_id IS NOT NULL
          AND outsider_workspace_id IS NOT NULL
    ) = 1,
    'test workspaces and active members were created'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '94000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'discovery-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '94000000-0000-4000-8000-000000000001',
        'email', 'discovery-owner@coldingrod.test',
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
    existing_lead_id,
    workspace_id,
    'Existing Dental Studio',
    'new',
    'acceptance_test'
FROM discovery_test_context;

WITH discovery_result AS (
    SELECT *
    FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        jsonb_build_object(
            'run_name', 'Pune dental studios',
            'market', 'Dental',
            'location', 'Pune, Maharashtra',
            'service_focus', 'Website redesign',
            'notes', 'Only observed public business information.'
        ),
        jsonb_build_array(
            jsonb_build_object(
                'company_name', 'Fresh Growth Studio',
                'website_url', 'https://fresh-growth.example',
                'industry', 'Dental',
                'location', 'Pune, Maharashtra',
                'source_url', 'https://directory.example/fresh-growth',
                'business_email', 'hello@fresh-growth.example',
                'business_phone', '+91 90000 00000',
                'evidence_notes', 'Observed outdated booking experience.'
            ),
            jsonb_build_object(
                'company_name', 'Existing Dental Studio',
                'location', 'Pune, Maharashtra'
            ),
            jsonb_build_object(
                'company_name', 'Fresh Growth Studio',
                'website_url', 'https://fresh-growth.example'
            )
        )
    )
)
UPDATE discovery_test_context
SET
    run_id = discovery_result.run_id,
    discovery_action_id = discovery_result.action_id
FROM discovery_result;

UPDATE discovery_test_context context
SET
    ready_candidate_id = ready.id,
    duplicate_lead_candidate_id = duplicate_lead.id,
    duplicate_batch_candidate_id = duplicate_batch.id
FROM public.lead_discovery_candidates ready
JOIN public.lead_discovery_candidates duplicate_lead
  ON duplicate_lead.run_id = ready.run_id
 AND duplicate_lead.source_index = 2
JOIN public.lead_discovery_candidates duplicate_batch
  ON duplicate_batch.run_id = ready.run_id
 AND duplicate_batch.source_index = 3
WHERE ready.run_id = context.run_id
  AND ready.source_index = 1;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs run
        JOIN discovery_test_context context ON context.run_id = run.id
        WHERE run.status = 'completed'
          AND run.candidate_count = 3
          AND run.ready_count = 1
          AND run.duplicate_count = 2
          AND run.imported_count = 0
          AND run.ai_action_id = context.discovery_action_id
          AND run.finished_at IS NOT NULL
    ) = 1,
    'discovery completes with accurate ready and duplicate counts'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_candidates candidate
        JOIN discovery_test_context context
          ON context.run_id = candidate.run_id
        WHERE (
            candidate.id = context.ready_candidate_id
            AND candidate.status = 'ready'
        )
        OR (
            candidate.id = context.duplicate_lead_candidate_id
            AND candidate.status = 'duplicate'
            AND candidate.matched_lead_id = context.existing_lead_id
        )
        OR (
            candidate.id = context.duplicate_batch_candidate_id
            AND candidate.status = 'duplicate'
            AND candidate.duplicate_of_candidate_id =
                context.ready_candidate_id
        )
    ) = 3,
    'existing and within-run duplicates retain their traceable match'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN discovery_test_context context
          ON context.discovery_action_id = action.id
        WHERE action.action_type = 'discover_leads'
          AND action.status = 'completed'
          AND action.entity_type = 'lead_discovery_run'
          AND action.entity_id = context.run_id
          AND action.agent_id =
              '00000000-0000-4000-8000-000000000302'
          AND action.result_data ->> 'ready_count' = '1'
    ) = 1,
    'discovery records a completed, transparent AI action'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN discovery_test_context context
          ON context.run_id = activity.entity_id
        WHERE activity.entity_type = 'lead_discovery_run'
          AND activity.actor_type = 'ai_agent'
          AND activity.actor_agent_id =
              '00000000-0000-4000-8000-000000000302'
          AND activity.action = 'lead_discovery_completed'
    ) = 1,
    'discovery creates one AI activity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN discovery_test_context context
          ON context.run_id = activity.entity_id
        WHERE activity.action = 'lead_discovery_completed'
    ) = 1,
    'owner sees their own discovery notification through RLS'
);

SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.lead_discovery_runs (
          workspace_id, run_name, created_by
      )
      SELECT
          workspace_id, 'Bypass attempt',
          '94000000-0000-4000-8000-000000000001'
      FROM discovery_test_context$$,
    'owner cannot bypass discovery RPC to create a run'
);
SELECT pg_temp.expect_permission_denied(
    $$UPDATE public.lead_discovery_candidates
      SET status = 'dismissed'
      WHERE id = (
          SELECT ready_candidate_id FROM discovery_test_context
      )$$,
    'owner cannot rewrite staged candidates directly'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        '{"run_name":"Invalid","unsupported":true}'::jsonb,
        '[{"company_name":"Valid Company"}]'::jsonb
    )$$,
    'unknown brief fields are rejected'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        '{"run_name":"Invalid candidate"}'::jsonb,
        '[{"company_name":"Valid Company","website_url":"javascript:alert(1)"}]'::jsonb
    )$$,
    'non-HTTP candidate URLs are rejected'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        '{"run_name":"Missing name"}'::jsonb,
        '[{"location":"Pune"}]'::jsonb
    )$$,
    'candidate company name is required'
);

WITH import_result AS (
    SELECT *
    FROM public.import_lead_discovery_candidates(
        (SELECT workspace_id FROM discovery_test_context),
        (SELECT run_id FROM discovery_test_context),
        ARRAY[
            (SELECT ready_candidate_id FROM discovery_test_context)
        ]
    )
)
UPDATE discovery_test_context
SET import_action_id = import_result.action_id
FROM import_result;

UPDATE discovery_test_context context
SET imported_lead_id = candidate.imported_lead_id
FROM public.lead_discovery_candidates candidate
WHERE candidate.id = context.ready_candidate_id;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.leads lead
        JOIN discovery_test_context context
          ON context.imported_lead_id = lead.id
        WHERE lead.company_name = 'Fresh Growth Studio'
          AND lead.status = 'new'
          AND lead.source = 'Lead Discovery: Pune dental studios'
          AND lead.website_url = 'https://fresh-growth.example'
          AND lead.industry = 'Dental'
          AND lead.location = 'Pune, Maharashtra'
          AND lead.business_email = 'hello@fresh-growth.example'
          AND lead.business_phone = '+91 90000 00000'
    ) = 1,
    'selected candidate becomes an enriched lead'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs run
        JOIN discovery_test_context context ON context.run_id = run.id
        WHERE run.status = 'imported'
          AND run.ready_count = 0
          AND run.duplicate_count = 2
          AND run.imported_count = 1
    ) = 1,
    'import updates run status and counts atomically'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN discovery_test_context context
          ON context.import_action_id = action.id
        WHERE action.action_type = 'import_discovered_leads'
          AND action.status = 'completed'
          AND action.result_data ->> 'imported_count' = '1'
    ) = 1,
    'import records a completed AI orchestration action'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN discovery_test_context context
          ON context.run_id = activity.entity_id
        WHERE activity.entity_type = 'lead_discovery_run'
          AND activity.actor_type = 'human'
          AND activity.action = 'discovered_leads_imported'
    ) = 1,
    'batch import emits one descriptive run-level activity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN discovery_test_context context
          ON context.imported_lead_id = activity.entity_id
        WHERE activity.entity_type = 'leads'
    ) = 0,
    'batch import suppresses generic per-lead audit activity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN discovery_test_context context
          ON context.run_id = activity.entity_id
        WHERE activity.action = 'discovered_leads_imported'
    ) = 1,
    'owner sees one import notification through RLS'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.import_lead_discovery_candidates(
        (SELECT workspace_id FROM discovery_test_context),
        (SELECT run_id FROM discovery_test_context),
        ARRAY[
            (SELECT ready_candidate_id FROM discovery_test_context)
        ]
    )$$,
    'an imported candidate cannot be imported again'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '94000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'discovery-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '94000000-0000-4000-8000-000000000002',
        'email', 'discovery-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs
        WHERE id = (SELECT run_id FROM discovery_test_context)
    ) = 1
    AND (
        SELECT count(*)
        FROM public.lead_discovery_candidates
        WHERE run_id = (SELECT run_id FROM discovery_test_context)
    ) = 3,
    'active member can read workspace discovery results'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        '{"run_name":"Unauthorized"}'::jsonb,
        '[{"company_name":"Unauthorized Candidate"}]'::jsonb
    )$$,
    'member without manage permissions cannot run discovery'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM discovery_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs
        WHERE id = (SELECT run_id FROM discovery_test_context)
    ) = 0,
    'soft-deleted member immediately loses discovery visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '94000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'discovery-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '94000000-0000-4000-8000-000000000003',
        'email', 'discovery-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs
        WHERE id = (SELECT run_id FROM discovery_test_context)
    ) = 0
    AND (
        SELECT count(*)
        FROM public.lead_discovery_candidates
        WHERE run_id = (SELECT run_id FROM discovery_test_context)
    ) = 0,
    'workspace outsider cannot read discovery data'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_test_context),
        '{"run_name":"Outsider"}'::jsonb,
        '[{"company_name":"Outsider Candidate"}]'::jsonb
    )$$,
    'workspace outsider cannot run discovery'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_2_lead_discovery_acceptance,
    'all synthetic Phase 3.2 rows will be rolled back' AS cleanup;
ROLLBACK;
