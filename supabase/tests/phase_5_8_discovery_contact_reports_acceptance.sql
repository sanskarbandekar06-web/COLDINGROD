-- Discovery contact bridge and report-output acceptance test.
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

CREATE TEMP TABLE discovery_contact_context (
    workspace_id UUID,
    direct_lead_id UUID,
    run_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON discovery_contact_context TO authenticated;

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.run_enriched_lead_discovery_intake(uuid,jsonb,jsonb)'
    ) IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'lead_contacts'
          AND column_name = 'facebook_url'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'lead_discovery_candidates'
          AND column_name = 'instagram_handle'
    ),
    'enriched discovery RPC and public social destinations exist'
);

SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.run_enriched_lead_discovery_intake(uuid,jsonb,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.run_enriched_lead_discovery_intake(uuid,jsonb,jsonb)',
        'EXECUTE'
    ),
    'only authenticated users can run enriched discovery'
);

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES (
    '85800000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'discovery-contact@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Discovery Contact Owner'),
    now(),
    now()
);

INSERT INTO discovery_contact_context (workspace_id, direct_lead_id)
SELECT
    workspace.id,
    '85800000-0000-4000-8000-000000000010'
FROM public.workspaces workspace
WHERE workspace.created_by = '85800000-0000-4000-8000-000000000001'
  AND workspace.is_personal;

SELECT set_config(
    'request.jwt.claim.sub',
    '85800000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '85800000-0000-4000-8000-000000000001',
        'email', 'discovery-contact@coldingrod.test',
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
    business_email,
    business_phone
)
SELECT
    direct_lead_id,
    workspace_id,
    'Stored Contact Business',
    'new',
    'acceptance_test',
    'hello@stored-contact.example',
    '+91 98888 00000'
FROM discovery_contact_context;

SELECT pg_temp.assert_true(
    (
        SELECT contact.is_primary
           AND contact.email = 'hello@stored-contact.example'
           AND contact.phone = '+91 98888 00000'
           AND contact.job_title = 'Business contact'
        FROM discovery_contact_context context
        JOIN public.lead_contacts contact
          ON contact.lead_id = context.direct_lead_id
    ),
    'stored lead phone and email automatically create an outreach-ready contact'
);

WITH discovery AS (
    SELECT *
    FROM public.run_enriched_lead_discovery_intake(
        (SELECT workspace_id FROM discovery_contact_context),
        jsonb_build_object(
            'run_name', 'Enriched contact acceptance',
            'market', 'Fitness',
            'location', 'Pune'
        ),
        jsonb_build_array(
            jsonb_build_object(
                'company_name', 'Enriched Fitness Studio',
                'website_url', 'https://enriched-fitness.example',
                'industry', 'Fitness',
                'location', 'Pune',
                'business_email', 'hello@enriched-fitness.example',
                'business_phone', '+91 97777 00000',
                'linkedin_url',
                    'https://www.linkedin.com/company/enriched-fitness',
                'instagram_handle', '@enriched.fitness',
                'facebook_url',
                    'https://www.facebook.com/enriched.fitness',
                'source_url', 'https://enriched-fitness.example/contact',
                'evidence_notes', 'Verified public business destinations.'
            )
        )
    )
)
UPDATE discovery_contact_context
SET run_id = discovery.run_id
FROM discovery;

SELECT *
FROM public.import_lead_discovery_candidates(
    (SELECT workspace_id FROM discovery_contact_context),
    (SELECT run_id FROM discovery_contact_context),
    ARRAY[
        (
            SELECT candidate.id
            FROM public.lead_discovery_candidates candidate
            WHERE candidate.run_id = (
                SELECT run_id FROM discovery_contact_context
            )
        )
    ]
);

SELECT pg_temp.assert_true(
    (
        SELECT contact.email = 'hello@enriched-fitness.example'
           AND contact.phone = '+91 97777 00000'
           AND contact.linkedin_url =
               'https://www.linkedin.com/company/enriched-fitness'
           AND contact.instagram_handle = 'enriched.fitness'
           AND contact.facebook_url =
               'https://www.facebook.com/enriched.fitness'
        FROM discovery_contact_context context
        JOIN public.lead_discovery_candidates candidate
          ON candidate.run_id = context.run_id
        JOIN public.lead_contacts contact
          ON contact.lead_id = candidate.imported_lead_id
    ),
    'imported discovery destinations are immediately usable by outreach'
);

RESET ROLE;
SELECT 'PASS' AS phase_5_8_discovery_contact_reports_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;
