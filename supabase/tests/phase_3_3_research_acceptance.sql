-- Phase 3.3 hosted research and pain-point acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_3_research_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE research_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    outsider_workspace_id UUID,
    lead_id UUID,
    unqualified_lead_id UUID,
    report_id UUID,
    research_action_id UUID,
    analysis_action_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON research_test_context TO authenticated;

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
        'public.run_lead_research(uuid,uuid,jsonb)'
    ) IS NOT NULL,
    'research RPC exists'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure(
            'public.run_lead_research(uuid,uuid,jsonb)'
        )
          AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']
    ),
    'research RPC is security definer with controlled search path'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.run_lead_research(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.run_lead_research(uuid,uuid,jsonb)',
        'EXECUTE'
    ),
    'only authenticated clients execute research'
);
SELECT pg_temp.assert_true(
    has_table_privilege(
        'authenticated',
        'public.lead_research_reports',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_research_reports',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_research_reports',
        'UPDATE'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_research_reports',
        'DELETE'
    ),
    'research reports are read-only for authenticated clients'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_agents
        WHERE id IN (
            '00000000-0000-4000-8000-000000000303',
            '00000000-0000-4000-8000-000000000304'
        )
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ) = 2,
    'research and pain-point system agents are installed'
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
        '95000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'research-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Research Owner'),
        now(),
        now()
    ),
    (
        '95000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'research-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Research Member'),
        now(),
        now()
    ),
    (
        '95000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'research-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Research Outsider'),
        now(),
        now()
    );

INSERT INTO research_test_context (
    workspace_id,
    owner_member_id,
    lead_id,
    unqualified_lead_id
)
SELECT
    workspace.id,
    member.id,
    '95000000-0000-4000-8000-000000000010',
    '95000000-0000-4000-8000-000000000011'
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '95000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by = '95000000-0000-4000-8000-000000000001';

UPDATE research_test_context context
SET outsider_workspace_id = workspace.id
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by = '95000000-0000-4000-8000-000000000003';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT workspace_id, '95000000-0000-4000-8000-000000000002'
FROM research_test_context;

UPDATE research_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '95000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT set_config(
    'request.jwt.claim.sub',
    '95000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'research-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '95000000-0000-4000-8000-000000000001',
        'email', 'research-owner@coldingrod.test',
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
    'Research Acceptance Lead',
    'new'::public.lead_status,
    'acceptance_test'
FROM research_test_context
UNION ALL
SELECT
    unqualified_lead_id,
    workspace_id,
    'Unqualified Research Lead',
    'new'::public.lead_status,
    'acceptance_test'
FROM research_test_context;

SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM research_test_context),
    (SELECT lead_id FROM research_test_context),
    jsonb_build_object(
        'website_status', 'none',
        'social_status', 'missing',
        'seo_status', 'weak',
        'google_rating', 3.2,
        'google_review_count', 0,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Research acceptance qualification.'
    )
);

WITH research_result AS (
    SELECT *
    FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        jsonb_build_object(
            'source_type', 'manual_observation',
            'offerings', 'Family dental and cosmetic services.',
            'target_audience', 'Families and working professionals in Pune.',
            'differentiators', 'Long operating history and specialist care.',
            'evidence_notes', 'Only public website and directory evidence.',
            'source_urls', jsonb_build_array(
                'https://research.example/dental',
                'https://research.example/dental'
            )
        )
    )
)
UPDATE research_test_context
SET
    report_id = research_result.report_id,
    research_action_id = research_result.research_action_id,
    analysis_action_id = research_result.analysis_action_id
FROM research_result;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports report
        JOIN research_test_context context ON context.report_id = report.id
        WHERE report.workspace_id = context.workspace_id
          AND report.lead_id = context.lead_id
          AND report.source_type = 'manual_observation'
          AND report.evidence_field_count = 4
          AND report.source_count = 1
          AND report.confidence = 88
          AND jsonb_array_length(report.pain_points) = 7
          AND report.qualification_score_id IS NOT NULL
    ) = 1,
    'research report preserves evidence and transparent confidence'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports report
        JOIN LATERAL jsonb_array_elements(report.pain_points) point ON TRUE
        WHERE report.id = (SELECT report_id FROM research_test_context)
          AND point ->> 'key' = 'website'
          AND point ->> 'label' = 'Website conversion gap'
          AND point ->> 'priority' = 'high'
          AND point ->> 'service_opportunity' =
              'Conversion-focused website redesign'
    ) = 1,
    'pain points map stored qualification evidence to agency opportunity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports report
        JOIN LATERAL jsonb_array_elements(report.pain_points) point ON TRUE
        WHERE report.id = (SELECT report_id FROM research_test_context)
          AND point ->> 'key' = 'booking'
          AND point ->> 'label' = 'Enquiry and booking friction'
          AND point ->> 'service_opportunity' =
              'Booking and lead-capture automation'
    ) = 1,
    'research uses the exact Phase 3.1 booking factor key'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN research_test_context context
          ON action.id IN (
              context.research_action_id,
              context.analysis_action_id
          )
        WHERE action.status = 'completed'
          AND action.entity_type = 'lead'
          AND action.entity_id = context.lead_id
          AND action.action_type IN (
              'research_business',
              'analyze_pain_points'
          )
          AND action.result_data ->> 'report_id' =
              context.report_id::TEXT
    ) = 2,
    'research creates linked completed actions for both agents'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN research_test_context context
          ON context.lead_id = activity.entity_id
        WHERE activity.entity_type = 'lead'
          AND activity.actor_type = 'ai_agent'
          AND activity.actor_agent_id =
              '00000000-0000-4000-8000-000000000304'
          AND activity.action = 'lead_research_completed'
    ) = 1,
    'pain-point completion emits one AI activity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN research_test_context context
          ON context.lead_id = activity.entity_id
        WHERE activity.action = 'lead_research_completed'
    ) = 1,
    'owner sees their own research notification through RLS'
);
SELECT pg_temp.expect_permission_denied(
    $$INSERT INTO public.lead_research_reports (
        workspace_id, lead_id, evidence_field_count, source_count, confidence,
        qualification_score_id, research_action_id, analysis_action_id,
        created_by
      )
      SELECT
        context.workspace_id, context.lead_id, 2, 0, 50,
        score.id, context.research_action_id, context.analysis_action_id,
        '95000000-0000-4000-8000-000000000001'
      FROM research_test_context context
      JOIN public.lead_scores score ON score.lead_id = context.lead_id
      LIMIT 1$$,
    'owner cannot bypass research RPC'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        '{"offerings":"Known","target_audience":"Known","unsupported":true}'::jsonb
    )$$,
    'unknown research fields are rejected'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        '{"offerings":"Only one field"}'::jsonb
    )$$,
    'at least two research evidence fields are required'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        '{"offerings":"Known","target_audience":"Known","source_urls":["javascript:alert(1)"]}'::jsonb
    )$$,
    'non-HTTP research sources are rejected'
);
SELECT pg_temp.expect_invalid_parameter(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT unqualified_lead_id FROM research_test_context),
        '{"offerings":"Known","target_audience":"Known"}'::jsonb
    )$$,
    'research requires a stored qualification'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '95000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'research-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '95000000-0000-4000-8000-000000000002',
        'email', 'research-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports
        WHERE id = (SELECT report_id FROM research_test_context)
    ) = 1,
    'active member may read workspace research'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        '{"offerings":"Known","target_audience":"Known"}'::jsonb
    )$$,
    'member without manage permissions cannot run research'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM research_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports
        WHERE id = (SELECT report_id FROM research_test_context)
    ) = 0,
    'soft-deleted member immediately loses research visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '95000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'research-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '95000000-0000-4000-8000-000000000003',
        'email', 'research-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_research_reports
        WHERE id = (SELECT report_id FROM research_test_context)
    ) = 0,
    'workspace outsider cannot read research'
);
SELECT pg_temp.expect_permission_denied(
    $$SELECT * FROM public.run_lead_research(
        (SELECT workspace_id FROM research_test_context),
        (SELECT lead_id FROM research_test_context),
        '{"offerings":"Known","target_audience":"Known"}'::jsonb
    )$$,
    'workspace outsider cannot run research'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_3_research_acceptance,
    'all synthetic Phase 3.3 rows will be rolled back' AS cleanup;
ROLLBACK;
