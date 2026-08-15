-- Phase 5.10 report-grounded outreach and paired-browser preparation.
-- All synthetic rows are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition BOOLEAN, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
    IF NOT COALESCE(condition, FALSE) THEN
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

CREATE TEMP TABLE report_grounding_context (
    workspace_id UUID,
    lead_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT ON report_grounding_context TO authenticated, anon;

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.browser_extension_get_outreach_basis(text,uuid)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.browser_extension_prepare_lead_intelligence(text,uuid,jsonb,jsonb,jsonb)'
    ) IS NOT NULL,
    'paired-browser report grounding RPCs exist'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'anon',
        'public.browser_extension_get_outreach_basis(text,uuid)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'anon',
        'public.browser_extension_prepare_lead_intelligence(text,uuid,jsonb,jsonb,jsonb)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'authenticated',
        'public.browser_extension_get_outreach_basis(text,uuid)',
        'EXECUTE'
    ),
    'only the anonymous paired-token boundary can execute the new RPCs'
);
SELECT pg_temp.assert_true(
    (
        SELECT bool_and(procedure.prosecdef)
           AND bool_and(procedure.proconfig @> ARRAY['search_path=""'])
        FROM pg_proc procedure
        WHERE procedure.oid IN (
            to_regprocedure(
                'public.browser_extension_get_outreach_basis(text,uuid)'
            ),
            to_regprocedure(
                'public.browser_extension_prepare_lead_intelligence(text,uuid,jsonb,jsonb,jsonb)'
            )
        )
    ),
    'paired-token RPCs are definer functions with empty search paths'
);

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES (
    'a5100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'report-grounding-owner@coldingrod.test',
    jsonb_build_object(),
    jsonb_build_object('full_name', 'Report Grounding Owner'),
    now(), now()
);

INSERT INTO report_grounding_context (workspace_id, lead_id)
SELECT workspace.id, 'a5100000-0000-4000-8000-000000000010'
FROM public.workspaces workspace
WHERE workspace.created_by = 'a5100000-0000-4000-8000-000000000001'
  AND workspace.is_personal;

SELECT set_config(
    'request.jwt.claim.sub',
    'a5100000-0000-4000-8000-000000000001',
    TRUE
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', 'a5100000-0000-4000-8000-000000000001',
        'email', 'report-grounding-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    TRUE
);
SET LOCAL ROLE authenticated;

INSERT INTO public.leads (
    id, workspace_id, company_name, status, source, industry, location
)
SELECT
    lead_id, workspace_id, 'Report Grounded Fitness', 'new',
    'acceptance_test', 'Fitness', 'Mumbai'
FROM report_grounding_context;

INSERT INTO public.browser_extension_connections (
    workspace_id, user_id, token_hash, device_name, expires_at
)
SELECT
    workspace_id,
    'a5100000-0000-4000-8000-000000000001',
    repeat('5', 64),
    'Report Grounding Browser',
    now() + interval '30 days'
FROM report_grounding_context;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claims', '{}'::JSONB::TEXT, TRUE);
SET LOCAL ROLE anon;

SELECT public.browser_extension_prepare_lead_intelligence(
    repeat('5', 64),
    (SELECT lead_id FROM report_grounding_context),
    jsonb_build_object(
        'website_status', 'poor',
        'social_status', 'active',
        'seo_status', 'weak',
        'has_clear_cta', FALSE,
        'has_online_booking', FALSE,
        'evidence_notes',
            'Verified public Instagram and phone; booking was not observed.'
    ),
    jsonb_build_object(
        'source_type', 'manual_observation',
        'offerings', 'Public fitness coaching profile.',
        'observed_challenges', 'No online booking path was observed.',
        'evidence_notes', 'Executive and detailed evidence are public.',
        'source_urls', jsonb_build_array(
            'https://report-grounding.example'
        )
    ),
    jsonb_build_object(
        'phone', '+919999900001',
        'instagram_handle', 'report_grounded_fitness'
    )
);

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM public.lead_research_reports report
        JOIN report_grounding_context context
          ON context.lead_id = report.lead_id
         AND context.workspace_id = report.workspace_id
        WHERE jsonb_array_length(report.pain_points) > 0
          AND report.research_summary ? 'offerings'
          AND report.research_summary ? 'evidence_notes'
    ),
    'paired preparation creates the report used by both document views'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*) = 1
        FROM public.lead_contacts contact
        JOIN report_grounding_context context
          ON context.lead_id = contact.lead_id
        WHERE contact.phone = '+919999900001'
          AND contact.instagram_handle = 'report_grounded_fitness'
    ),
    'paired preparation persists independently verified contact channels'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
    (
        public.browser_extension_get_outreach_basis(
            repeat('5', 64),
            (SELECT lead_id FROM report_grounding_context)
        ) #>> '{report,id}'
    ) IS NOT NULL
    AND (
        public.browser_extension_get_outreach_basis(
            repeat('5', 64),
            (SELECT lead_id FROM report_grounding_context)
        ) #>> '{contacts,0,instagram_handle}'
    ) = 'report_grounded_fitness',
    'extension receives both report grounding and refreshed destinations'
);

SELECT pg_temp.expect_sqlstate(
    format(
        'SELECT public.browser_extension_get_outreach_basis(%L, %L::UUID)',
        repeat('0', 64),
        (SELECT lead_id FROM report_grounding_context)
    ),
    '28000',
    'invalid pairing token'
);

RESET ROLE;
SELECT 'PASS' AS phase_5_10_report_grounded_outreach_acceptance;
ROLLBACK;
