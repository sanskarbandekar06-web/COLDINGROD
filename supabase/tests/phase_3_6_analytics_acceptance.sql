-- Phase 3.6 hosted analytics and optimization acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_6_analytics_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE analytics_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    lead_id UUID,
    contact_id UUID,
    approved_message_id UUID,
    approved_action_id UUID,
    pending_message_id UUID,
    pending_action_id UUID,
    snapshot_id UUID,
    analytics_action_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON analytics_test_context TO authenticated;

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

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(
    statement TEXT,
    expected_state TEXT,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
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
$fn$;

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.run_workspace_analytics(uuid,integer)'
    ) IS NOT NULL,
    'analytics RPC exists'
);
SELECT pg_temp.assert_true(
    (
        SELECT procedure.prosecdef
           AND procedure.proconfig @>
               ARRAY['search_path=public, pg_temp']
        FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure(
            'public.run_workspace_analytics(uuid,integer)'
        )
    ),
    'analytics RPC is security definer with a controlled search path'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.run_workspace_analytics(uuid,integer)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.run_workspace_analytics(uuid,integer)',
        'EXECUTE'
    ),
    'only authenticated clients execute analytics'
);
SELECT pg_temp.assert_true(
    has_table_privilege(
        'authenticated',
        'public.workspace_analytics_snapshots',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.workspace_analytics_snapshots',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.workspace_analytics_snapshots',
        'UPDATE'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.workspace_analytics_snapshots',
        'DELETE'
    ),
    'analytics snapshots are read-only outside the trusted RPC'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_agents
        WHERE id = '00000000-0000-4000-8000-000000000308'
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ) = 1,
    'Analytics and Optimization Agent is installed'
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
        '99000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'analytics-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Analytics Owner'),
        NOW(),
        NOW()
    ),
    (
        '99000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'analytics-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Analytics Member'),
        NOW(),
        NOW()
    ),
    (
        '99000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'analytics-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Analytics Outsider'),
        NOW(),
        NOW()
    );

INSERT INTO analytics_test_context (
    workspace_id,
    owner_member_id,
    lead_id,
    contact_id
)
SELECT
    workspace.id,
    member.id,
    '99000000-0000-4000-8000-000000000010',
    '99000000-0000-4000-8000-000000000020'
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '99000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by =
      '99000000-0000-4000-8000-000000000001';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT
    workspace_id,
    '99000000-0000-4000-8000-000000000002'
FROM analytics_test_context;

UPDATE analytics_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '99000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT set_config(
    'request.jwt.claim.sub',
    '99000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'analytics-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '99000000-0000-4000-8000-000000000001',
        'email', 'analytics-owner@coldingrod.test',
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
    'Analytics Acceptance Dental',
    'new'::public.lead_status,
    'acceptance_test'
FROM analytics_test_context;

INSERT INTO public.lead_contacts (
    id,
    lead_id,
    first_name,
    last_name,
    job_title,
    is_primary,
    email,
    phone,
    linkedin_url
)
SELECT
    contact_id,
    lead_id,
    'Maya',
    'Rao',
    'Owner',
    TRUE,
    'maya@analytics.example',
    '+919999900004',
    'https://www.linkedin.com/in/maya-analytics'
FROM analytics_test_context;

SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM analytics_test_context),
    (SELECT lead_id FROM analytics_test_context),
    jsonb_build_object(
        'website_status', 'none',
        'social_status', 'missing',
        'seo_status', 'weak',
        'google_rating', 3.2,
        'google_review_count', 0,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Phase 3.6 analytics acceptance qualification.'
    )
);

SELECT *
FROM public.run_lead_research(
    (SELECT workspace_id FROM analytics_test_context),
    (SELECT lead_id FROM analytics_test_context),
    jsonb_build_object(
        'source_type', 'manual_observation',
        'offerings', 'Family and cosmetic dental services.',
        'target_audience', 'Families and professionals in Bengaluru.',
        'evidence_notes', 'Public website and directory evidence only.',
        'source_urls', jsonb_build_array(
            'https://research.example/analytics-dental'
        )
    )
);

WITH generated AS (
    SELECT *
    FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM analytics_test_context),
        (SELECT lead_id FROM analytics_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM analytics_test_context),
            'platform', 'email',
            'tone', 'consultative',
            'goal', 'offer_audit'
        )
    )
)
UPDATE analytics_test_context
SET
    approved_message_id = generated.message_id,
    approved_action_id = generated.compliance_action_id
FROM generated;

SELECT *
FROM public.decide_ai_action(
    (SELECT workspace_id FROM analytics_test_context),
    (SELECT approved_action_id FROM analytics_test_context),
    'approved',
    NULL
);

RESET ROLE;
UPDATE public.outreach_messages
SET
    status = 'sent',
    sent_at = NOW()
WHERE id = (
    SELECT approved_message_id FROM analytics_test_context
);
SET LOCAL ROLE authenticated;

WITH generated AS (
    SELECT *
    FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM analytics_test_context),
        (SELECT lead_id FROM analytics_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM analytics_test_context),
            'platform', 'linkedin',
            'tone', 'warm',
            'goal', 'share_idea'
        )
    )
)
UPDATE analytics_test_context
SET
    pending_message_id = generated.message_id,
    pending_action_id = generated.compliance_action_id
FROM generated;

INSERT INTO public.outreach_messages (
    workspace_id,
    lead_id,
    contact_id,
    platform,
    direction,
    subject,
    content,
    status
)
SELECT
    workspace_id,
    lead_id,
    contact_id,
    'email',
    'inbound',
    'Re: website audit',
    'Thanks, let us discuss the audit.',
    'replied'
FROM analytics_test_context;

INSERT INTO public.meetings (
    workspace_id,
    organizer_id,
    title,
    status,
    start_time,
    end_time,
    timezone,
    lead_id,
    created_by
)
SELECT
    workspace_id,
    owner_member_id,
    'Analytics acceptance discovery call',
    'scheduled'::public.meeting_status,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '23 hours',
    'Asia/Kolkata',
    lead_id,
    '99000000-0000-4000-8000-000000000001'
FROM analytics_test_context;

SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.run_workspace_analytics(
        (SELECT workspace_id FROM analytics_test_context),
        14
    )$$,
    '22023',
    'analytics rejects unsupported periods'
);

WITH generated AS (
    SELECT *
    FROM public.run_workspace_analytics(
        (SELECT workspace_id FROM analytics_test_context),
        30
    )
)
UPDATE analytics_test_context
SET
    snapshot_id = generated.snapshot_id,
    analytics_action_id = generated.action_id
FROM generated;

SELECT pg_temp.assert_true(
    (
        SELECT
            snapshot.period_days = 30
            AND snapshot.period_end > snapshot.period_start
            AND snapshot.created_by =
                '99000000-0000-4000-8000-000000000001'
            AND snapshot.metrics ->> 'rules_version' =
                'coldingrod-analytics-v1'
            AND (snapshot.metrics ->> 'leads_created')::INTEGER = 1
            AND (snapshot.metrics ->> 'qualified_leads')::INTEGER = 1
            AND (snapshot.metrics ->> 'research_reports')::INTEGER = 1
            AND (snapshot.metrics ->> 'ai_generated_messages')::INTEGER = 2
            AND (snapshot.metrics ->> 'approved_messages')::INTEGER = 1
            AND (snapshot.metrics ->> 'sent_messages')::INTEGER = 1
            AND (snapshot.metrics ->> 'responses')::INTEGER = 1
            AND (snapshot.metrics ->> 'meetings_scheduled')::INTEGER = 1
            AND (snapshot.metrics ->> 'pending_approvals')::INTEGER = 1
            AND (snapshot.metrics ->> 'average_opportunity_score')::INTEGER = 94
            AND (snapshot.metrics ->> 'approval_rate')::NUMERIC = 50
            AND (snapshot.metrics ->> 'delivery_rate')::NUMERIC = 100
            AND (snapshot.metrics ->> 'response_rate')::NUMERIC = 100
            AND (snapshot.metrics ->> 'meeting_rate')::NUMERIC = 100
            AND jsonb_array_length(snapshot.metrics -> 'funnel') = 7
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                    snapshot.recommendations
                ) recommendation
                WHERE recommendation ->> 'key' = 'review_pending'
            )
        FROM public.workspace_analytics_snapshots snapshot
        WHERE snapshot.id = (
            SELECT snapshot_id FROM analytics_test_context
        )
    ),
    'snapshot contains exact funnel metrics and deterministic guidance'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN analytics_test_context context
          ON context.analytics_action_id = action.id
        WHERE action.status = 'completed'
          AND action.action_type = 'analyze_workspace_funnel'
          AND action.entity_type = 'workspace_analytics_snapshot'
          AND action.entity_id = context.snapshot_id
          AND action.result_data ->> 'snapshot_id' =
              context.snapshot_id::TEXT
    ) = 1,
    'analytics action links to the immutable snapshot'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN analytics_test_context context
          ON context.snapshot_id = activity.entity_id
        WHERE activity.entity_type = 'workspace_analytics_snapshot'
          AND activity.actor_type = 'ai_agent'
          AND activity.actor_agent_id =
              '00000000-0000-4000-8000-000000000308'
          AND activity.action = 'workspace_analytics_completed'
    ) = 1
    AND (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN analytics_test_context context
          ON context.snapshot_id = activity.entity_id
        WHERE activity.action = 'workspace_analytics_completed'
    ) = 1,
    'analytics completion is audited and notified'
);

SELECT pg_temp.expect_sqlstate(
    $$INSERT INTO public.workspace_analytics_snapshots (
        workspace_id,
        period_days,
        period_start,
        period_end,
        metrics,
        recommendations,
        action_id,
        created_by
    )
    SELECT
        workspace_id,
        30,
        NOW() - INTERVAL '30 days',
        NOW(),
        '{}'::jsonb,
        '[]'::jsonb,
        analytics_action_id,
        '99000000-0000-4000-8000-000000000001'
    FROM analytics_test_context$$,
    '42501',
    'owners cannot forge analytics snapshots'
);

RESET ROLE;
SELECT set_config(
    'request.jwt.claim.sub',
    '99000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'analytics-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '99000000-0000-4000-8000-000000000002',
        'email', 'analytics-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.workspace_analytics_snapshots
        WHERE id = (
            SELECT snapshot_id FROM analytics_test_context
        )
    ) = 1,
    'active member may read analytics snapshots'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.run_workspace_analytics(
        (SELECT workspace_id FROM analytics_test_context),
        30
    )$$,
    '42501',
    'member without manage permissions cannot run analytics'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM analytics_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.workspace_analytics_snapshots
        WHERE id = (
            SELECT snapshot_id FROM analytics_test_context
        )
    ) = 0,
    'soft-deleted member loses analytics visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '99000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'analytics-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '99000000-0000-4000-8000-000000000003',
        'email', 'analytics-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.workspace_analytics_snapshots
        WHERE id = (
            SELECT snapshot_id FROM analytics_test_context
        )
    ) = 0,
    'workspace outsider cannot read analytics snapshots'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.run_workspace_analytics(
        (SELECT workspace_id FROM analytics_test_context),
        30
    )$$,
    '42501',
    'workspace outsider cannot run analytics'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_6_analytics_acceptance,
    'all synthetic Phase 3.6 rows will be rolled back' AS cleanup;
ROLLBACK;
