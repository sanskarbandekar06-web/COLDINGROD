-- Platform-native outreach and authenticated web delivery acceptance test.
-- All synthetic data is rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition BOOLEAN, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
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
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE actual_state TEXT;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    END;
    IF actual_state IS DISTINCT FROM expected_state THEN
        RAISE EXCEPTION 'EXPECTED SQLSTATE % FOR %, GOT %',
            expected_state, label, COALESCE(actual_state, 'no error');
    END IF;
END;
$fn$;

CREATE TEMP TABLE platform_outreach_context (
    workspace_id UUID,
    lead_id UUID,
    contact_id UUID,
    email_message_id UUID,
    email_action_id UUID,
    whatsapp_message_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON platform_outreach_context TO authenticated;

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.generate_personalized_outreach_v2(uuid,uuid,jsonb)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.confirm_outreach_sent(uuid,uuid)'
    ) IS NOT NULL,
    'platform outreach and web delivery RPCs exist'
);

SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.generate_personalized_outreach_v2(uuid,uuid,jsonb)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.confirm_outreach_sent(uuid,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.confirm_outreach_sent(uuid,uuid)',
        'EXECUTE'
    ),
    'only authenticated users can generate and confirm web delivery'
);

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES (
    '85700000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'platform-outreach@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Platform Outreach Owner'),
    now(),
    now()
);

INSERT INTO platform_outreach_context (workspace_id, lead_id, contact_id)
SELECT
    workspace.id,
    '85700000-0000-4000-8000-000000000010',
    '85700000-0000-4000-8000-000000000020'
FROM public.workspaces workspace
WHERE workspace.created_by = '85700000-0000-4000-8000-000000000001'
  AND workspace.is_personal;

SELECT set_config(
    'request.jwt.claim.sub',
    '85700000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '85700000-0000-4000-8000-000000000001',
        'email', 'platform-outreach@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

INSERT INTO public.leads (
    id, workspace_id, company_name, status, source, industry, location
)
SELECT
    lead_id,
    workspace_id,
    'Platform Native Dental',
    'new',
    'acceptance_test',
    'Dental',
    'Pune'
FROM platform_outreach_context;

INSERT INTO public.lead_contacts (
    id, lead_id, first_name, last_name, job_title, is_primary,
    email, phone, linkedin_url, instagram_handle
)
SELECT
    contact_id,
    lead_id,
    'Asha',
    'Patil',
    'Owner',
    TRUE,
    'asha@platform.example',
    '+919999900007',
    'https://www.linkedin.com/in/platform-asha',
    '@platform_asha'
FROM platform_outreach_context;

SELECT * FROM public.run_lead_qualification(
    (SELECT workspace_id FROM platform_outreach_context),
    (SELECT lead_id FROM platform_outreach_context),
    jsonb_build_object(
        'website_status', 'poor',
        'social_status', 'inactive',
        'seo_status', 'weak',
        'google_rating', 3.4,
        'google_review_count', 5,
        'has_clear_cta', false,
        'has_online_booking', false,
        'evidence_notes', 'Verified public evidence for platform testing.'
    )
);

SELECT * FROM public.run_lead_research(
    (SELECT workspace_id FROM platform_outreach_context),
    (SELECT lead_id FROM platform_outreach_context),
    jsonb_build_object(
        'source_type', 'manual_observation',
        'offerings', 'Family and cosmetic dental services.',
        'target_audience', 'Families and professionals in Pune.',
        'evidence_notes', 'Public website evidence only.',
        'source_urls', jsonb_build_array(
            'https://platform.example/research'
        )
    )
);

WITH generated AS (
    SELECT * FROM public.generate_personalized_outreach_v2(
        (SELECT workspace_id FROM platform_outreach_context),
        (SELECT lead_id FROM platform_outreach_context),
        jsonb_build_object(
            'contact_id', (SELECT contact_id FROM platform_outreach_context),
            'platform', 'email',
            'tone', 'consultative',
            'goal', 'offer_audit',
            'subject', 'A practical idea for Platform Native Dental',
            'content', E'Hello Asha,\n\nI noticed an opportunity around online booking. I can share a concise audit with practical next steps.\n\nIf this is not relevant, just let me know and I will not follow up.\n\nRegards,',
            'generator', 'acceptance-model'
        )
    )
)
UPDATE platform_outreach_context
SET email_message_id = generated.message_id,
    email_action_id = generated.compliance_action_id
FROM generated;

WITH generated AS (
    SELECT * FROM public.generate_personalized_outreach_v2(
        (SELECT workspace_id FROM platform_outreach_context),
        (SELECT lead_id FROM platform_outreach_context),
        jsonb_build_object(
            'contact_id', (SELECT contact_id FROM platform_outreach_context),
            'platform', 'whatsapp',
            'tone', 'warm',
            'goal', 'share_idea',
            'subject', NULL,
            'content', 'Hi Asha! I noticed an online booking opportunity for Platform Native Dental. Want me to send one practical idea? If it is not relevant, just say so and I will not follow up.',
            'generator', 'acceptance-model'
        )
    )
)
UPDATE platform_outreach_context
SET whatsapp_message_id = generated.message_id
FROM generated;

SELECT pg_temp.assert_true(
    (
        SELECT email.subject IS NOT NULL
           AND whatsapp.subject IS NULL
           AND email.content <> whatsapp.content
           AND email.platform = 'email'
           AND whatsapp.platform = 'whatsapp'
           AND email_version.content = email.content
           AND whatsapp_version.content = whatsapp.content
        FROM platform_outreach_context context
        JOIN public.outreach_messages email
          ON email.id = context.email_message_id
        JOIN public.outreach_messages whatsapp
          ON whatsapp.id = context.whatsapp_message_id
        JOIN public.message_versions email_version
          ON email_version.outreach_message_id = email.id
         AND email_version.version_number = 1
        JOIN public.message_versions whatsapp_version
          ON whatsapp_version.outreach_message_id = whatsapp.id
         AND whatsapp_version.version_number = 1
    ),
    'email and WhatsApp store different channel-native copy and exact versions'
);

SELECT * FROM public.decide_ai_action(
    (SELECT workspace_id FROM platform_outreach_context),
    (SELECT email_action_id FROM platform_outreach_context),
    'approved',
    NULL
);

SELECT public.confirm_outreach_sent(
    (SELECT workspace_id FROM platform_outreach_context),
    (SELECT email_message_id FROM platform_outreach_context)
);

SELECT pg_temp.expect_sqlstate(
    $$SELECT public.confirm_outreach_sent(
        (SELECT workspace_id FROM platform_outreach_context),
        (SELECT whatsapp_message_id FROM platform_outreach_context)
    )$$,
    '22023',
    'unapproved message cannot be confirmed sent'
);

SELECT pg_temp.assert_true(
    (
        SELECT message.status = 'sent'
           AND message.sent_at IS NOT NULL
           AND lead.status = 'contacted'
           AND activity.metadata ->> 'source' =
               'coldingrod_web_companion'
        FROM platform_outreach_context context
        JOIN public.outreach_messages message
          ON message.id = context.email_message_id
        JOIN public.leads lead ON lead.id = context.lead_id
        JOIN public.activities activity
          ON activity.entity_type = 'outreach_message'
         AND activity.entity_id = message.id
         AND activity.action = 'message_sent_confirmed'
    ),
    'approved web delivery confirmation updates message, lead, and audit trail'
);

RESET ROLE;
SELECT 'PASS' AS phase_5_7_platform_outreach_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;

