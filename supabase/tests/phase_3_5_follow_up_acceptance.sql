-- Phase 3.5 hosted response-aware follow-up acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_5_follow_up_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE follow_up_test_context (
    workspace_id UUID,
    member_id UUID,
    lead_id UUID,
    contact_id UUID,
    original_message_id UUID,
    original_action_id UUID,
    sequence_id UUID,
    planning_action_id UUID,
    first_step_id UUID,
    first_follow_up_message_id UUID,
    first_compliance_action_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON follow_up_test_context TO authenticated;

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
        'public.create_follow_up_sequence(uuid,uuid,jsonb)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.prepare_due_follow_up(uuid,uuid)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.set_follow_up_sequence_status(uuid,uuid,text)'
    ) IS NOT NULL,
    'all follow-up RPCs exist'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_proc procedure
        WHERE procedure.oid IN (
            to_regprocedure(
                'public.create_follow_up_sequence(uuid,uuid,jsonb)'
            ),
            to_regprocedure(
                'public.prepare_due_follow_up(uuid,uuid)'
            ),
            to_regprocedure(
                'public.set_follow_up_sequence_status(uuid,uuid,text)'
            )
        )
          AND procedure.prosecdef
          AND procedure.proconfig @>
              ARRAY['search_path=public, pg_temp']
    ) = 3,
    'follow-up RPCs are security definer with controlled search paths'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.create_follow_up_sequence(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.create_follow_up_sequence(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.prepare_due_follow_up(uuid,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.prepare_due_follow_up(uuid,uuid)',
        'EXECUTE'
    ),
    'only authenticated clients execute follow-up RPCs'
);
SELECT pg_temp.assert_true(
    has_table_privilege(
        'authenticated',
        'public.follow_up_sequences',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.follow_up_sequences',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.follow_up_steps',
        'UPDATE'
    ),
    'follow-up state is read-only outside trusted RPCs'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_agents
        WHERE id = '00000000-0000-4000-8000-000000000307'
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ) = 1,
    'Follow-Up Agent is installed'
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
        '98000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'follow-up-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Follow-Up Owner'),
        now(),
        now()
    ),
    (
        '98000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'follow-up-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Follow-Up Member'),
        now(),
        now()
    ),
    (
        '98000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'follow-up-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Follow-Up Outsider'),
        now(),
        now()
    );

INSERT INTO follow_up_test_context (
    workspace_id,
    lead_id,
    contact_id
)
SELECT
    workspace.id,
    '98000000-0000-4000-8000-000000000010',
    '98000000-0000-4000-8000-000000000020'
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by =
      '98000000-0000-4000-8000-000000000001';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT
    workspace_id,
    '98000000-0000-4000-8000-000000000002'
FROM follow_up_test_context;

UPDATE follow_up_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id =
      '98000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT set_config(
    'request.jwt.claim.sub',
    '98000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'follow-up-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '98000000-0000-4000-8000-000000000001',
        'email', 'follow-up-owner@coldingrod.test',
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
    'Follow-Up Acceptance Dental',
    'new'::public.lead_status,
    'acceptance_test'
FROM follow_up_test_context;

INSERT INTO public.lead_contacts (
    id,
    lead_id,
    first_name,
    last_name,
    job_title,
    is_primary,
    email,
    phone
)
SELECT
    contact_id,
    lead_id,
    'Neha',
    'Shah',
    'Owner',
    TRUE,
    'neha@follow-up.example',
    '+919999900003'
FROM follow_up_test_context;

SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM follow_up_test_context),
    (SELECT lead_id FROM follow_up_test_context),
    jsonb_build_object(
        'website_status', 'none',
        'social_status', 'missing',
        'seo_status', 'weak',
        'google_rating', 3.4,
        'google_review_count', 2,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Phase 3.5 acceptance qualification.'
    )
);

SELECT *
FROM public.run_lead_research(
    (SELECT workspace_id FROM follow_up_test_context),
    (SELECT lead_id FROM follow_up_test_context),
    jsonb_build_object(
        'source_type', 'manual_observation',
        'offerings', 'Family and cosmetic dental services.',
        'target_audience', 'Families and professionals in Mumbai.',
        'evidence_notes', 'Public website and directory evidence only.',
        'source_urls', jsonb_build_array(
            'https://research.example/follow-up-dental'
        )
    )
);

WITH generated AS (
    SELECT *
    FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT lead_id FROM follow_up_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM follow_up_test_context),
            'platform', 'email',
            'tone', 'consultative',
            'goal', 'offer_audit'
        )
    )
)
UPDATE follow_up_test_context
SET
    original_message_id = generated.message_id,
    original_action_id = generated.compliance_action_id
FROM generated;

SELECT *
FROM public.decide_ai_action(
    (SELECT workspace_id FROM follow_up_test_context),
    (SELECT original_action_id FROM follow_up_test_context),
    'approved',
    NULL
);

RESET ROLE;
UPDATE public.outreach_messages
SET
    status = 'sent',
    sent_at = NOW() - INTERVAL '4 days'
WHERE id = (
    SELECT original_message_id FROM follow_up_test_context
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.create_follow_up_sequence(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT original_message_id FROM follow_up_test_context),
        '{"cadence_days":[7,3]}'::jsonb
    )$$,
    '22023',
    'cadence days must be strictly increasing'
);

WITH planned AS (
    SELECT *
    FROM public.create_follow_up_sequence(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT original_message_id FROM follow_up_test_context),
        '{"cadence_days":[3,7,14]}'::jsonb
    )
)
UPDATE follow_up_test_context
SET
    sequence_id = planned.sequence_id,
    planning_action_id = planned.planning_action_id
FROM planned;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_sequences sequence
        JOIN follow_up_test_context context
          ON context.sequence_id = sequence.id
        WHERE sequence.workspace_id = context.workspace_id
          AND sequence.lead_id = context.lead_id
          AND sequence.contact_id = context.contact_id
          AND sequence.original_message_id =
              context.original_message_id
          AND sequence.status = 'active'
          AND sequence.cadence_days = '[3,7,14]'::jsonb
          AND sequence.stop_on_response
          AND sequence.completed_at IS NULL
    ) = 1,
    'sequence is tied to verified delivery and response stopping'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_steps step
        JOIN public.follow_up_sequences sequence
          ON sequence.id = step.sequence_id
        JOIN public.outreach_messages message
          ON message.id = sequence.original_message_id
        WHERE sequence.id = (
            SELECT sequence_id FROM follow_up_test_context
        )
          AND step.status = 'planned'
          AND step.message_id IS NULL
          AND step.due_at = message.sent_at +
              ((step.step_number = 1)::INTEGER * INTERVAL '3 days')
              + ((step.step_number = 2)::INTEGER * INTERVAL '7 days')
              + ((step.step_number = 3)::INTEGER * INTERVAL '14 days')
    ) = 3,
    'three planned steps use exact delivery-relative due times'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN follow_up_test_context context
          ON context.planning_action_id = action.id
        WHERE action.status = 'completed'
          AND action.action_type = 'plan_follow_up_sequence'
          AND action.entity_type = 'follow_up_sequence'
          AND action.entity_id = context.sequence_id
          AND action.result_data ->> 'delivery_performed' =
              'false'
    ) = 1,
    'planning action records zero delivery'
);

WITH prepared AS (
    SELECT *
    FROM public.prepare_due_follow_up(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT sequence_id FROM follow_up_test_context)
    )
)
UPDATE follow_up_test_context
SET
    first_step_id = prepared.step_id,
    first_follow_up_message_id = prepared.message_id,
    first_compliance_action_id = prepared.compliance_action_id
FROM prepared
WHERE prepared.outcome = 'prepared';

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_steps step
        JOIN follow_up_test_context context
          ON context.first_step_id = step.id
        JOIN public.outreach_messages message
          ON message.id = context.first_follow_up_message_id
        JOIN public.ai_actions action
          ON action.id = context.first_compliance_action_id
        WHERE step.step_number = 1
          AND step.status = 'draft_ready'
          AND step.message_id = message.id
          AND step.compliance_action_id = action.id
          AND step.prepared_at IS NOT NULL
          AND message.status = 'pending_approval'
          AND message.sent_at IS NULL
          AND message.subject LIKE 'Re: Idea for%'
          AND message.content LIKE '%Hello Neha,%'
          AND message.content LIKE
              '%conversion-focused website redesign%'
          AND message.content LIKE '%I will not follow up.%'
          AND action.status = 'pending_approval'
          AND action.action_type = 'review_follow_up_compliance'
          AND action.result_data ->> 'delivery_performed' =
              'false'
          AND jsonb_array_length(
              action.result_data -> 'checks'
          ) = 7
    ) = 1,
    'due step creates a compliant pending draft without sending'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.message_versions version
        JOIN follow_up_test_context context
          ON context.first_follow_up_message_id =
              version.outreach_message_id
        JOIN public.outreach_messages message
          ON message.id = version.outreach_message_id
        WHERE version.version_number = 1
          AND version.edited_by IS NULL
          AND version.content = message.content
          AND version.change_reason =
              'Generated for response-aware follow-up step 1'
    ) = 1,
    'follow-up draft has an exact initial version'
);
SELECT pg_temp.assert_true(
    (
        SELECT outcome
        FROM public.prepare_due_follow_up(
            (SELECT workspace_id FROM follow_up_test_context),
            (SELECT sequence_id FROM follow_up_test_context)
        )
    ) = 'waiting_for_previous_delivery',
    'next draft waits for verified delivery of the previous step'
);

SELECT pg_temp.assert_true(
    public.set_follow_up_sequence_status(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT sequence_id FROM follow_up_test_context),
        'paused'
    ) = 'paused',
    'active sequence can be paused'
);
SELECT pg_temp.assert_true(
    (
        SELECT outcome
        FROM public.prepare_due_follow_up(
            (SELECT workspace_id FROM follow_up_test_context),
            (SELECT sequence_id FROM follow_up_test_context)
        )
    ) = 'paused',
    'paused sequence does not prepare drafts'
);
SELECT pg_temp.assert_true(
    public.set_follow_up_sequence_status(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT sequence_id FROM follow_up_test_context),
        'active'
    ) = 'active',
    'paused sequence can be resumed'
);

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
    'Re: follow-up',
    'Thanks, please send the audit.',
    'replied'
FROM follow_up_test_context;

SELECT pg_temp.assert_true(
    (
        SELECT outcome
        FROM public.prepare_due_follow_up(
            (SELECT workspace_id FROM follow_up_test_context),
            (SELECT sequence_id FROM follow_up_test_context)
        )
    ) = 'stopped',
    'a response stops the sequence before another draft'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_sequences sequence
        JOIN follow_up_test_context context
          ON context.sequence_id = sequence.id
        WHERE sequence.status = 'completed'
          AND sequence.stopped_reason = 'response_detected'
          AND sequence.completed_at IS NOT NULL
    ) = 1
    AND (
        SELECT count(*)
        FROM public.follow_up_steps step
        WHERE step.sequence_id = (
            SELECT sequence_id FROM follow_up_test_context
        )
          AND step.status = 'cancelled'
    ) = 2,
    'response completion cancels every remaining planned step'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        WHERE activity.entity_type = 'follow_up_sequence'
          AND activity.entity_id = (
              SELECT sequence_id FROM follow_up_test_context
          )
          AND activity.action IN (
              'follow_up_sequence_planned',
              'follow_up_draft_awaiting_review',
              'follow_up_sequence_stopped'
          )
    ) = 3,
    'planning, draft preparation, and response stopping are audited'
);

RESET ROLE;
SELECT set_config(
    'request.jwt.claim.sub',
    '98000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'follow-up-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '98000000-0000-4000-8000-000000000002',
        'email', 'follow-up-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_sequences
        WHERE id = (
            SELECT sequence_id FROM follow_up_test_context
        )
    ) = 1,
    'active member may read follow-up state'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.prepare_due_follow_up(
        (SELECT workspace_id FROM follow_up_test_context),
        (SELECT sequence_id FROM follow_up_test_context)
    )$$,
    '42501',
    'member without manage permissions cannot prepare follow-ups'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM follow_up_test_context);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_sequences
        WHERE id = (
            SELECT sequence_id FROM follow_up_test_context
        )
    ) = 0,
    'soft-deleted member loses follow-up visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '98000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'follow-up-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '98000000-0000-4000-8000-000000000003',
        'email', 'follow-up-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.follow_up_sequences
        WHERE id = (
            SELECT sequence_id FROM follow_up_test_context
        )
    ) = 0,
    'workspace outsider cannot read follow-up state'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_5_follow_up_acceptance,
    'all synthetic Phase 3.5 rows will be rolled back' AS cleanup;
ROLLBACK;
