-- Phase 5.9 automatic lead-intelligence finalization acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_5_9_automatic_lead_intelligence_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE automatic_intelligence_test_context (
    workspace_id UUID,
    lead_id UUID,
    report_id UUID,
    outsider_workspace_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON automatic_intelligence_test_context
    TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition BOOLEAN,
    label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT COALESCE(condition, FALSE) THEN
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
    denied BOOLEAN := FALSE;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN insufficient_privilege THEN
        denied := TRUE;
    END;
    IF NOT denied THEN
        RAISE EXCEPTION 'EXPECTED PERMISSION DENIAL: %', label;
    END IF;
END;
$fn$;

SELECT pg_temp.assert_true(
    to_regprocedure(
        'public.finalize_automatic_lead_research(uuid,uuid)'
    ) IS NOT NULL,
    'automatic research finalizer exists'
);
SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_proc procedure
        WHERE procedure.oid = to_regprocedure(
            'public.finalize_automatic_lead_research(uuid,uuid)'
        )
          AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=""']
    ),
    'automatic research finalizer has an empty controlled search path'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.finalize_automatic_lead_research(uuid,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.finalize_automatic_lead_research(uuid,uuid)',
        'EXECUTE'
    ),
    'only authenticated clients execute automatic research finalization'
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
        '9d000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'automatic-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Automatic Owner'),
        now(),
        now()
    ),
    (
        '9d000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'automatic-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Automatic Outsider'),
        now(),
        now()
    );

INSERT INTO automatic_intelligence_test_context (
    workspace_id,
    lead_id,
    outsider_workspace_id
)
SELECT
    owner_workspace.id,
    '9d000000-0000-4000-8000-000000000010',
    outsider_workspace.id
FROM public.workspaces owner_workspace
CROSS JOIN public.workspaces outsider_workspace
WHERE owner_workspace.is_personal
  AND owner_workspace.created_by =
      '9d000000-0000-4000-8000-000000000001'
  AND outsider_workspace.is_personal
  AND outsider_workspace.created_by =
      '9d000000-0000-4000-8000-000000000002';

SELECT set_config(
    'request.jwt.claim.sub',
    '9d000000-0000-4000-8000-000000000001',
    TRUE
);
SELECT set_config(
    'request.jwt.claim.email',
    'automatic-owner@coldingrod.test',
    TRUE
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '9d000000-0000-4000-8000-000000000001',
        'email', 'automatic-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    TRUE
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
    'Automatic Intelligence Acceptance Lead',
    'new'::public.lead_status,
    'acceptance_test'
FROM automatic_intelligence_test_context;

SELECT *
FROM public.run_lead_qualification(
    (SELECT workspace_id FROM automatic_intelligence_test_context),
    (SELECT lead_id FROM automatic_intelligence_test_context),
    jsonb_build_object(
        'website_status', 'good',
        'social_status', 'active',
        'seo_status', 'strong',
        'has_clear_cta', TRUE,
        'has_online_booking', TRUE,
        'evidence_notes', 'Verified public profile with unknown ratings.'
    )
);

WITH research_result AS (
    SELECT *
    FROM public.run_lead_research(
        (SELECT workspace_id FROM automatic_intelligence_test_context),
        (SELECT lead_id FROM automatic_intelligence_test_context),
        jsonb_build_object(
            'source_type', 'manual_observation',
            'offerings', 'Verified public business profile.',
            'evidence_notes',
                'Ratings and review totals were not observed and remain unknown.',
            'source_urls', jsonb_build_array(
                'https://automatic-intelligence.example'
            )
        )
    )
)
UPDATE automatic_intelligence_test_context context
SET report_id = research_result.report_id
FROM research_result;

SELECT *
FROM public.finalize_automatic_lead_research(
    (SELECT workspace_id FROM automatic_intelligence_test_context),
    (SELECT lead_id FROM automatic_intelligence_test_context)
);

SELECT pg_temp.assert_true(
    (
        SELECT jsonb_array_length(report.pain_points) = 1
           AND report.pain_points -> 0 ->> 'key' = 'exploratory_growth'
           AND report.pain_points -> 0 ->> 'priority' = 'low'
           AND report.pain_points -> 0 ->> 'points' = '0'
        FROM public.lead_research_reports report
        WHERE report.id = (
            SELECT report_id FROM automatic_intelligence_test_context
        )
    ),
    'unknown-only gaps become one transparent neutral opportunity'
);
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM public.lead_research_reports report
        CROSS JOIN LATERAL jsonb_array_elements(report.pain_points) point
        WHERE report.id = (
            SELECT report_id FROM automatic_intelligence_test_context
        )
          AND lower(COALESCE(point ->> 'evidence', '')) ~ ': unknown$'
    ),
    'automatic research does not retain unknown-only service claims'
);
SELECT pg_temp.assert_true(
    (
        SELECT action.payload ->> 'automatic_public_research' = 'true'
           AND action.result_data ->> 'unknown_opportunities_removed' = 'true'
           AND action.result_data ->> 'used_neutral_opportunity' = 'true'
        FROM public.ai_actions action
        JOIN public.lead_research_reports report
          ON report.analysis_action_id = action.id
        WHERE report.id = (
            SELECT report_id FROM automatic_intelligence_test_context
        )
    ),
    'analysis audit metadata records automatic finalization'
);

RESET ROLE;
SELECT set_config(
    'request.jwt.claim.sub',
    '9d000000-0000-4000-8000-000000000002',
    TRUE
);
SELECT set_config(
    'request.jwt.claim.email',
    'automatic-outsider@coldingrod.test',
    TRUE
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '9d000000-0000-4000-8000-000000000002',
        'email', 'automatic-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    TRUE
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_permission_denied(
    format(
        'SELECT * FROM public.finalize_automatic_lead_research(%L, %L)',
        (SELECT workspace_id FROM automatic_intelligence_test_context),
        (SELECT lead_id FROM automatic_intelligence_test_context)
    ),
    'an outsider cannot finalize another workspace research report'
);

RESET ROLE;
ROLLBACK;
