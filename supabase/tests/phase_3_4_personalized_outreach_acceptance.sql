-- Phase 3.4 hosted personalization, compliance, and approval acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_3_4_personalized_outreach_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE outreach_agent_test_context (
    workspace_id UUID,
    owner_member_id UUID,
    member_id UUID,
    outsider_workspace_id UUID,
    lead_id UUID,
    unresearched_lead_id UUID,
    contact_id UUID,
    other_contact_id UUID,
    message_id UUID,
    personalization_action_id UUID,
    compliance_action_id UUID,
    rejected_message_id UUID,
    rejected_action_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON outreach_agent_test_context
    TO authenticated;

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
        'public.generate_personalized_outreach(uuid,uuid,jsonb)'
    ) IS NOT NULL,
    'personalized outreach RPC exists'
);
SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.decide_ai_action(uuid,uuid,text,text)'
    ) IS NOT NULL,
    'atomic decision RPC exists'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_proc procedure
        WHERE procedure.oid IN (
            to_regprocedure(
                'public.generate_personalized_outreach(uuid,uuid,jsonb)'
            ),
            to_regprocedure(
                'public.decide_ai_action(uuid,uuid,text,text)'
            )
        )
          AND procedure.prosecdef
          AND procedure.proconfig @>
              ARRAY['search_path=public, pg_temp']
    ) = 2,
    'both RPCs are security definer with controlled search paths'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.generate_personalized_outreach(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.generate_personalized_outreach(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.decide_ai_action(uuid,uuid,text,text)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.decide_ai_action(uuid,uuid,text,text)',
        'EXECUTE'
    ),
    'only authenticated clients execute Phase 3.4 RPCs'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_agents
        WHERE id IN (
            '00000000-0000-4000-8000-000000000305',
            '00000000-0000-4000-8000-000000000306'
        )
          AND workspace_id IS NULL
          AND model = 'coldingrod-rules-v1'
          AND deleted_at IS NULL
    ) = 2,
    'personalization and compliance agents are installed'
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
        '97000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'outreach-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Outreach Owner'),
        now(),
        now()
    ),
    (
        '97000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'outreach-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Outreach Member'),
        now(),
        now()
    ),
    (
        '97000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'outreach-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Outreach Outsider'),
        now(),
        now()
    );

INSERT INTO outreach_agent_test_context (
    workspace_id,
    owner_member_id,
    lead_id,
    unresearched_lead_id,
    contact_id,
    other_contact_id
)
SELECT
    workspace.id,
    member.id,
    '97000000-0000-4000-8000-000000000010',
    '97000000-0000-4000-8000-000000000011',
    '97000000-0000-4000-8000-000000000020',
    '97000000-0000-4000-8000-000000000021'
FROM public.workspaces workspace
JOIN public.workspace_members member
  ON member.workspace_id = workspace.id
 AND member.user_id = '97000000-0000-4000-8000-000000000001'
WHERE workspace.is_personal
  AND workspace.created_by =
      '97000000-0000-4000-8000-000000000001';

UPDATE outreach_agent_test_context context
SET outsider_workspace_id = workspace.id
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by =
      '97000000-0000-4000-8000-000000000003';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT
    workspace_id,
    '97000000-0000-4000-8000-000000000002'
FROM outreach_agent_test_context;

UPDATE outreach_agent_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id =
      '97000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT set_config(
    'request.jwt.claim.sub',
    '97000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'outreach-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '97000000-0000-4000-8000-000000000001',
        'email', 'outreach-owner@coldingrod.test',
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
    'Personalization Acceptance Dental',
    'new'::public.lead_status,
    'acceptance_test'
FROM outreach_agent_test_context
UNION ALL
SELECT
    unresearched_lead_id,
    workspace_id,
    'Unresearched Outreach Lead',
    'new'::public.lead_status,
    'acceptance_test'
FROM outreach_agent_test_context;

INSERT INTO public.lead_contacts (
    id,
    lead_id,
    first_name,
    last_name,
    job_title,
    is_primary,
    email,
    phone,
    linkedin_url,
    instagram_handle
)
SELECT
    contact_id,
    lead_id,
    'Asha',
    'Patil',
    'Owner',
    TRUE,
    'asha@acceptance.example',
    '+919999900001',
    'https://www.linkedin.com/in/asha-acceptance',
    '@asha_acceptance'
FROM outreach_agent_test_context
UNION ALL
SELECT
    other_contact_id,
    unresearched_lead_id,
    'Other',
    'Contact',
    'Manager',
    TRUE,
    'other@acceptance.example',
    '+919999900002',
    'https://www.linkedin.com/in/other-acceptance',
    '@other_acceptance'
FROM outreach_agent_test_context;

SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM outreach_agent_test_context),
    (SELECT lead_id FROM outreach_agent_test_context),
    jsonb_build_object(
        'website_status', 'none',
        'social_status', 'missing',
        'seo_status', 'weak',
        'google_rating', 3.2,
        'google_review_count', 0,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Phase 3.4 acceptance qualification.'
    )
);

SELECT *
FROM public.run_lead_research(
    (SELECT workspace_id FROM outreach_agent_test_context),
    (SELECT lead_id FROM outreach_agent_test_context),
    jsonb_build_object(
        'source_type', 'manual_observation',
        'offerings', 'Family dental and cosmetic services.',
        'target_audience', 'Families and professionals in Pune.',
        'evidence_notes', 'Public website and directory evidence only.',
        'source_urls', jsonb_build_array(
            'https://research.example/personalization-dental'
        )
    )
);

WITH generated AS (
    SELECT *
    FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT lead_id FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM outreach_agent_test_context),
            'platform', 'email',
            'tone', 'consultative',
            'goal', 'offer_audit'
        )
    )
)
UPDATE outreach_agent_test_context
SET
    message_id = generated.message_id,
    personalization_action_id =
        generated.personalization_action_id,
    compliance_action_id = generated.compliance_action_id
FROM generated;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.outreach_messages message
        JOIN outreach_agent_test_context context
          ON context.message_id = message.id
        WHERE message.workspace_id = context.workspace_id
          AND message.lead_id = context.lead_id
          AND message.contact_id = context.contact_id
          AND message.platform = 'email'
          AND message.direction = 'outbound'
          AND message.status = 'pending_approval'
          AND message.sent_at IS NULL
          AND message.ai_action_id =
              context.compliance_action_id
          AND message.subject LIKE
              'Idea for Personalization Acceptance Dental:%'
          AND message.content LIKE '%Hello Asha,%'
          AND message.content LIKE
              '%Personalization Acceptance Dental%'
          AND message.content LIKE
              '%conversion-focused website redesign%'
          AND message.content LIKE
              '%I will not follow up.%'
    ) = 1,
    'grounded email draft is created without delivery'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.message_versions version
        JOIN outreach_agent_test_context context
          ON context.message_id = version.outreach_message_id
        JOIN public.outreach_messages message
          ON message.id = context.message_id
        WHERE version.version_number = 1
          AND version.edited_by IS NULL
          AND version.content = message.content
          AND version.change_reason =
              'Generated from evidence-backed lead research'
    ) = 1,
    'generated draft has an exact append-only version snapshot'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN outreach_agent_test_context context
          ON action.id = context.personalization_action_id
        WHERE action.status = 'completed'
          AND action.action_type = 'personalize_outreach'
          AND action.entity_type = 'lead'
          AND action.entity_id = context.lead_id
          AND action.result_data ->> 'grounded_in_research' =
              'true'
          AND action.result_data ->> 'delivery_performed' =
              'false'
    ) = 1,
    'personalization action records grounding and no delivery'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_actions action
        JOIN outreach_agent_test_context context
          ON action.id = context.compliance_action_id
        WHERE action.status = 'pending_approval'
          AND action.action_type = 'review_outreach_compliance'
          AND action.entity_type = 'outreach_message'
          AND action.entity_id = context.message_id
          AND action.result_data ->> 'compliance_passed' =
              'true'
          AND action.result_data ->>
              'human_approval_required' = 'true'
          AND action.result_data ->> 'delivery_performed' =
              'false'
          AND jsonb_array_length(
              action.result_data -> 'checks'
          ) = 6
    ) = 1,
    'compliance action remains pending with six transparent checks'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN outreach_agent_test_context context
          ON context.message_id = activity.entity_id
        WHERE activity.entity_type = 'outreach_message'
          AND activity.actor_type = 'ai_agent'
          AND activity.actor_agent_id =
              '00000000-0000-4000-8000-000000000306'
          AND activity.action =
              'personalized_outreach_awaiting_review'
    ) = 1,
    'compliance creates one review activity'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN outreach_agent_test_context context
          ON context.message_id = activity.entity_id
        WHERE activity.action =
              'personalized_outreach_awaiting_review'
    ) = 1,
    'owner receives the outreach review notification'
);

SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT lead_id FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT other_contact_id
                 FROM outreach_agent_test_context),
            'platform', 'email',
            'tone', 'warm',
            'goal', 'share_idea'
        )
    )$$,
    '22023',
    'cross-lead contact is rejected'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT lead_id FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id
                 FROM outreach_agent_test_context),
            'platform', 'facebook',
            'tone', 'warm',
            'goal', 'share_idea'
        )
    )$$,
    '22023',
    'unsupported recipient channel is rejected'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT unresearched_lead_id
         FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT other_contact_id
                 FROM outreach_agent_test_context),
            'platform', 'email',
            'tone', 'warm',
            'goal', 'share_idea'
        )
    )$$,
    '22023',
    'personalization requires stored research'
);

SELECT *
FROM public.decide_ai_action(
    (SELECT workspace_id FROM outreach_agent_test_context),
    (SELECT compliance_action_id
     FROM outreach_agent_test_context),
    'approved',
    NULL
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_approvals approval
        JOIN outreach_agent_test_context context
          ON context.compliance_action_id =
              approval.ai_action_id
        JOIN public.ai_actions action
          ON action.id = approval.ai_action_id
        JOIN public.outreach_messages message
          ON message.id = context.message_id
        WHERE approval.workspace_id = context.workspace_id
          AND approval.approver_id =
              '97000000-0000-4000-8000-000000000001'
          AND approval.decision = 'approved'
          AND approval.reason IS NULL
          AND approval.approved_payload ->> 'message_id' =
              context.message_id::TEXT
          AND approval.approved_payload ->> 'content' =
              message.content
          AND (
              approval.approved_payload ->> 'version_number'
          )::INTEGER = 1
          AND action.status = 'approved'
          AND message.status = 'scheduled'
          AND message.sent_at IS NULL
    ) = 1,
    'approval atomically stores action decision and exact message snapshot'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.decide_ai_action(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT compliance_action_id
         FROM outreach_agent_test_context),
        'approved',
        NULL
    )$$,
    'P0002',
    'a decided action cannot be reviewed twice'
);

WITH generated AS (
    SELECT *
    FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT lead_id FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM outreach_agent_test_context),
            'platform', 'sms',
            'tone', 'concise',
            'goal', 'share_idea'
        )
    )
)
UPDATE outreach_agent_test_context
SET
    rejected_message_id = generated.message_id,
    rejected_action_id = generated.compliance_action_id
FROM generated;

SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.decide_ai_action(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT rejected_action_id
         FROM outreach_agent_test_context),
        'rejected',
        'x'
    )$$,
    '22023',
    'rejection requires a meaningful reason'
);
SELECT *
FROM public.decide_ai_action(
    (SELECT workspace_id FROM outreach_agent_test_context),
    (SELECT rejected_action_id FROM outreach_agent_test_context),
    'rejected',
    'The wording needs a different call to action.'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.ai_approvals approval
        JOIN outreach_agent_test_context context
          ON context.rejected_action_id =
              approval.ai_action_id
        JOIN public.ai_actions action
          ON action.id = approval.ai_action_id
        JOIN public.outreach_messages message
          ON message.id = context.rejected_message_id
        WHERE approval.decision = 'rejected'
          AND approval.reason =
              'The wording needs a different call to action.'
          AND approval.approved_payload IS NULL
          AND action.status = 'rejected'
          AND message.status = 'failed'
          AND message.sent_at IS NULL
    ) = 1,
    'rejection is atomic and never sends or approves content'
);

RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '97000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'outreach-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '97000000-0000-4000-8000-000000000002',
        'email', 'outreach-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.outreach_messages
        WHERE id = (
            SELECT message_id FROM outreach_agent_test_context
        )
    ) = 1,
    'active workspace member can read outreach'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.generate_personalized_outreach(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT lead_id FROM outreach_agent_test_context),
        jsonb_build_object(
            'contact_id',
                (SELECT contact_id FROM outreach_agent_test_context),
            'platform', 'email',
            'tone', 'warm',
            'goal', 'share_idea'
        )
    )$$,
    '42501',
    'member without manage permissions cannot generate outreach'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.decide_ai_action(
        (SELECT workspace_id FROM outreach_agent_test_context),
        (SELECT rejected_action_id
         FROM outreach_agent_test_context),
        'approved',
        NULL
    )$$,
    '42501',
    'member without manage_ai cannot review actions'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (
    SELECT member_id FROM outreach_agent_test_context
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.outreach_messages
        WHERE id = (
            SELECT message_id FROM outreach_agent_test_context
        )
    ) = 0,
    'soft-deleted member immediately loses outreach visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '97000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'outreach-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '97000000-0000-4000-8000-000000000003',
        'email', 'outreach-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.outreach_messages
        WHERE id = (
            SELECT message_id FROM outreach_agent_test_context
        )
    ) = 0,
    'workspace outsider cannot read generated outreach'
);
RESET ROLE;

SELECT
    'PASS' AS phase_3_4_personalized_outreach_acceptance,
    'all synthetic Phase 3.4 rows will be rolled back' AS cleanup;
ROLLBACK;
