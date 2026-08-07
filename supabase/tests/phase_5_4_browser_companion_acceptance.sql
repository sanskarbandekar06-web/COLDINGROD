-- Phase 5.4 secure browser companion acceptance test.
-- All synthetic users and data are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

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

CREATE TEMP TABLE browser_companion_test_context (
    workspace_id UUID,
    lead_id UUID,
    contact_id UUID,
    connection_id UUID,
    message_id UUID,
    action_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE
    ON browser_companion_test_context TO authenticated, anon;

CREATE TEMP TABLE browser_companion_create_result (
    result JSONB
) ON COMMIT DROP;
GRANT SELECT, INSERT ON browser_companion_create_result TO anon;

SELECT pg_temp.assert_true(
    to_regclass('public.browser_extension_connections') IS NOT NULL,
    'browser connection table exists'
);
SELECT pg_temp.assert_true(
    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.browser_extension_connections'::regclass
    ),
    'browser connection table has RLS enabled'
);
SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.browser_extension_get_context(text,text,text,uuid)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.browser_extension_create_draft(text,jsonb)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.browser_extension_decide_message(text,uuid,text,text)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.browser_extension_mark_sent(text,uuid)'
    ) IS NOT NULL,
    'all browser companion RPCs exist'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'anon',
        'public.browser_extension_get_context(text,text,text,uuid)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'anon',
        'public.browser_extension_create_draft(text,jsonb)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'anon',
        'public.browser_extension_decide_message(text,uuid,text,text)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'anon',
        'public.browser_extension_mark_sent(text,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.browser_extension_require_connection(text,text[])',
        'EXECUTE'
    )
    AND NOT has_table_privilege(
        'anon',
        'public.browser_extension_connections',
        'SELECT'
    ),
    'anon can call only the token-validated public RPC boundary'
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
)
VALUES (
    '87511111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'browser-owner@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Browser Owner'),
    now(),
    now()
);

INSERT INTO browser_companion_test_context (
    workspace_id,
    lead_id,
    contact_id
)
SELECT
    workspace.id,
    '87522222-2222-4222-8222-222222222222',
    '87533333-3333-4333-8333-333333333333'
FROM public.workspaces workspace
WHERE workspace.created_by =
    '87511111-1111-4111-8111-111111111111'
  AND workspace.is_personal;

SELECT set_config(
    'request.jwt.claim.sub',
    '87511111-1111-4111-8111-111111111111',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'browser-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '87511111-1111-4111-8111-111111111111',
        'email', 'browser-owner@coldingrod.test',
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
    source,
    website_url,
    industry,
    location
)
SELECT
    lead_id,
    workspace_id,
    'Browser Companion Dental',
    'new',
    'browser_companion_acceptance',
    'https://browser-companion.example/clinic',
    'Dental',
    'Pune'
FROM browser_companion_test_context;

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
    'asha@browser-companion.example',
    '+919999900009',
    'https://www.linkedin.com/in/browser-companion-asha',
    '@browser_companion_asha'
FROM browser_companion_test_context;

INSERT INTO public.browser_extension_connections (
    workspace_id,
    user_id,
    token_hash,
    device_name,
    expires_at
)
SELECT
    workspace_id,
    '87511111-1111-4111-8111-111111111111',
    repeat('a', 64),
    'Acceptance Chrome',
    now() + interval '90 days'
FROM browser_companion_test_context
RETURNING id;

UPDATE browser_companion_test_context context
SET connection_id = connection.id
FROM public.browser_extension_connections connection
WHERE connection.workspace_id = context.workspace_id
  AND connection.user_id =
      '87511111-1111-4111-8111-111111111111'
  AND connection.token_hash = repeat('a', 64);

RESET ROLE;
SET LOCAL ROLE anon;

SELECT pg_temp.assert_true(
    (
        public.browser_extension_get_context(
            repeat('a', 64),
            'https://browser-companion.example/clinic/services',
            'Browser Companion Dental',
            NULL
        ) #>> '{selected_lead,id}'
    ) = '87522222-2222-4222-8222-222222222222',
    'active website automatically matches the workspace lead'
);

INSERT INTO browser_companion_create_result (result)
SELECT public.browser_extension_create_draft(
    repeat('a', 64),
    jsonb_build_object(
        'lead_id', lead_id,
        'contact_id', contact_id,
        'platform', 'email',
        'subject', 'A practical growth idea',
        'content',
            'Hi Asha, I have one practical idea for your clinic. Would a short conversation be useful?',
        'page_url',
            'https://browser-companion.example/clinic/services',
        'page_title', 'Browser Companion Dental'
    )
)
FROM browser_companion_test_context;

UPDATE browser_companion_test_context
SET
    message_id = (
        SELECT (result ->> 'message_id')::UUID
        FROM browser_companion_create_result
    ),
    action_id = (
        SELECT (result ->> 'action_id')::UUID
        FROM browser_companion_create_result
    );

SELECT public.browser_extension_decide_message(
    repeat('a', 64),
    (SELECT message_id FROM browser_companion_test_context),
    'approved',
    NULL
);

SELECT public.browser_extension_mark_sent(
    repeat('a', 64),
    (SELECT message_id FROM browser_companion_test_context)
);

RESET ROLE;

SELECT pg_temp.assert_true(
    (
        SELECT message.status = 'sent'
           AND message.sent_at IS NOT NULL
           AND action.status = 'approved'
           AND approval.decision = 'approved'
        FROM browser_companion_test_context context
        JOIN public.outreach_messages message
          ON message.id = context.message_id
        JOIN public.ai_actions action
          ON action.id = context.action_id
        JOIN public.ai_approvals approval
          ON approval.ai_action_id = action.id
    ),
    'draft is approved before audited sent confirmation'
);

SELECT pg_temp.assert_true(
    (
        SELECT lead.status = 'contacted'
        FROM browser_companion_test_context context
        JOIN public.leads lead ON lead.id = context.lead_id
    ),
    'verified delivery advances the lead to contacted'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 3
        FROM browser_companion_test_context context
        JOIN public.activities activity
          ON activity.entity_id = context.message_id
         AND activity.entity_type = 'outreach_message'
        WHERE activity.action IN (
            'browser_extension_message_submitted',
            'approval_granted',
            'message_sent_confirmed'
        )
    ),
    'draft, approval, and delivery all have human audit events'
);

UPDATE public.browser_extension_connections
SET revoked_at = now()
WHERE token_hash = repeat('a', 64);

SET LOCAL ROLE anon;
SELECT pg_temp.expect_sqlstate(
    $$SELECT public.browser_extension_get_context(
        repeat('a', 64),
        NULL,
        NULL,
        NULL
    )$$,
    '28000',
    'revoked pairing key cannot access workspace data'
);
RESET ROLE;

SELECT 'PASS' AS phase_5_4_browser_companion_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;
