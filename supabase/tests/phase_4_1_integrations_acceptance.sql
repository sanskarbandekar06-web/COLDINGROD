-- Phase 4.1 hosted provider integration acceptance test.
-- All synthetic rows are rolled back:
-- npx supabase db query --linked --file supabase/tests/phase_4_1_integrations_acceptance.sql

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE integration_test_context (
    workspace_id UUID,
    member_id UUID,
    run_id UUID,
    action_id UUID,
    candidate_id UUID,
    imported_lead_id UUID,
    integration_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON integration_test_context TO authenticated;

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
        'public.set_workspace_integration_enabled(uuid,integration_provider,boolean)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.record_workspace_integration_health(uuid,integration_provider,boolean,text)'
    ) IS NOT NULL
    AND to_regprocedure(
        'public.run_google_places_discovery_intake(uuid,jsonb,jsonb)'
    ) IS NOT NULL,
    'all provider integration RPCs exist'
);
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM pg_proc procedure
        WHERE procedure.oid IN (
            to_regprocedure(
                'public.set_workspace_integration_enabled(uuid,integration_provider,boolean)'
            ),
            to_regprocedure(
                'public.record_workspace_integration_health(uuid,integration_provider,boolean,text)'
            ),
            to_regprocedure(
                'public.run_google_places_discovery_intake(uuid,jsonb,jsonb)'
            )
        )
          AND procedure.prosecdef
          AND procedure.proconfig @>
              ARRAY['search_path=public, pg_temp']
    ) = 3,
    'provider RPCs are security definer with controlled search paths'
);
SELECT pg_temp.assert_true(
    has_function_privilege(
        'authenticated',
        'public.set_workspace_integration_enabled(uuid,integration_provider,boolean)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.set_workspace_integration_enabled(uuid,integration_provider,boolean)',
        'EXECUTE'
    )
    AND has_function_privilege(
        'authenticated',
        'public.run_google_places_discovery_intake(uuid,jsonb,jsonb)',
        'EXECUTE'
    ),
    'only authenticated clients execute provider RPCs'
);
SELECT pg_temp.assert_true(
    has_table_privilege(
        'authenticated',
        'public.lead_external_references',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_external_references',
        'INSERT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.lead_external_references',
        'UPDATE'
    ),
    'external references are read-only outside trusted imports'
);

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES
    (
        '9a000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'integration-owner@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Integration Owner'),
        NOW(),
        NOW()
    ),
    (
        '9a000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'integration-member@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Integration Member'),
        NOW(),
        NOW()
    ),
    (
        '9a000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'integration-outsider@coldingrod.test',
        jsonb_build_object(),
        jsonb_build_object('full_name', 'Integration Outsider'),
        NOW(),
        NOW()
    );

INSERT INTO integration_test_context (workspace_id)
SELECT workspace.id
FROM public.workspaces workspace
WHERE workspace.is_personal
  AND workspace.created_by =
      '9a000000-0000-4000-8000-000000000001';

INSERT INTO public.workspace_members (workspace_id, user_id)
SELECT
    workspace_id,
    '9a000000-0000-4000-8000-000000000002'
FROM integration_test_context;

UPDATE integration_test_context context
SET member_id = member.id
FROM public.workspace_members member
WHERE member.workspace_id = context.workspace_id
  AND member.user_id = '9a000000-0000-4000-8000-000000000002'
  AND member.deleted_at IS NULL;

SELECT set_config(
    'request.jwt.claim.sub',
    '9a000000-0000-4000-8000-000000000001',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'integration-owner@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '9a000000-0000-4000-8000-000000000001',
        'email', 'integration-owner@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;

WITH saved AS (
    SELECT *
    FROM public.set_workspace_integration_enabled(
        (SELECT workspace_id FROM integration_test_context),
        'google',
        TRUE
    )
)
UPDATE integration_test_context
SET integration_id = saved.integration_id
FROM saved;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.integrations integration
        JOIN integration_test_context context
          ON context.integration_id = integration.id
        WHERE integration.workspace_id = context.workspace_id
          AND integration.provider = 'google'
          AND integration.status = 'enabled'
          AND integration.connected_at IS NOT NULL
          AND integration.disconnected_at IS NULL
          AND integration.configured_by =
              '9a000000-0000-4000-8000-000000000001'
          AND integration.metadata ->> 'connection_mode' =
              'server_environment'
          AND integration.metadata ->> 'credentials_stored' = 'false'
    ) = 1,
    'Google Places can be enabled without storing credentials'
);

SELECT pg_temp.expect_sqlstate(
    $$UPDATE public.integrations
      SET metadata = '{"api_key":"must-not-persist"}'::jsonb
      WHERE id = (
          SELECT integration_id FROM integration_test_context
      )$$,
    '23514',
    'integration metadata rejects API keys'
);

SELECT public.record_workspace_integration_health(
    (SELECT workspace_id FROM integration_test_context),
    'google',
    TRUE,
    NULL
);
SELECT pg_temp.assert_true(
    (
        SELECT last_checked_at IS NOT NULL AND last_error IS NULL
        FROM public.integrations
        WHERE id = (
            SELECT integration_id FROM integration_test_context
        )
    ),
    'successful provider health is recorded without secret data'
);

WITH generated AS (
    SELECT *
    FROM public.run_google_places_discovery_intake(
        (SELECT workspace_id FROM integration_test_context),
        jsonb_build_object(
            'run_name', 'Google Places acceptance',
            'market', 'Dental clinics',
            'location', 'Pune',
            'service_focus', 'Website redesign',
            'notes', 'Business details were independently reviewed.'
        ),
        jsonb_build_array(
            jsonb_build_object(
                'company_name', 'Places Acceptance Dental',
                'industry', 'Dental clinic',
                'location', 'Pune, Maharashtra',
                'source_url', 'https://independent.example/places-dental',
                'evidence_notes',
                    'Independently verified public business details.',
                'external_reference', 'ChIJPlacesAcceptance123'
            )
        )
    )
)
UPDATE integration_test_context
SET
    run_id = generated.run_id,
    action_id = generated.action_id
FROM generated;

UPDATE integration_test_context context
SET candidate_id = candidate.id
FROM public.lead_discovery_candidates candidate
WHERE candidate.run_id = context.run_id
  AND candidate.source_index = 1;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_discovery_runs run
        JOIN public.lead_discovery_candidates candidate
          ON candidate.run_id = run.id
        JOIN public.ai_actions action
          ON action.id = run.ai_action_id
        JOIN integration_test_context context
          ON context.run_id = run.id
        WHERE run.source_type = 'google_places'
          AND candidate.external_provider = 'google_places'
          AND candidate.external_reference =
              'ChIJPlacesAcceptance123'
          AND action.id = context.action_id
          AND action.payload ->> 'source_type' = 'google_places'
          AND action.payload -> 'persisted_provider_fields' =
              '["place_id"]'::jsonb
          AND action.result_data ->> 'places_content_persisted' =
              'false'
          AND action.result_data ->> 'requires_human_import' =
              'true'
    ) = 1,
    'provider discovery stores only the Place ID and requires review'
);

SELECT pg_temp.assert_true(
    (
        SELECT imported_count = 1
        FROM public.import_lead_discovery_candidates(
            (SELECT workspace_id FROM integration_test_context),
            (SELECT run_id FROM integration_test_context),
            ARRAY[
                (SELECT candidate_id FROM integration_test_context)
            ]::UUID[]
        )
    ),
    'one reviewed provider candidate is imported'
);

UPDATE integration_test_context context
SET imported_lead_id = candidate.imported_lead_id
FROM public.lead_discovery_candidates candidate
WHERE candidate.id = context.candidate_id;

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.lead_external_references reference
        JOIN integration_test_context context
          ON context.imported_lead_id = reference.lead_id
        WHERE reference.workspace_id = context.workspace_id
          AND reference.provider = 'google_places'
          AND reference.external_id = 'ChIJPlacesAcceptance123'
    ) = 1,
    'human-approved import captures the permitted Place ID'
);

SELECT pg_temp.expect_sqlstate(
    $$INSERT INTO public.lead_external_references (
        workspace_id, lead_id, provider, external_id
      )
      SELECT
        workspace_id,
        imported_lead_id,
        'google_places',
        'ChIJForged'
      FROM integration_test_context$$,
    '42501',
    'authenticated owners cannot forge external references'
);

SELECT *
FROM public.set_workspace_integration_enabled(
    (SELECT workspace_id FROM integration_test_context),
    'google',
    FALSE
);
SELECT pg_temp.assert_true(
    (
        SELECT status = 'disabled'
           AND disconnected_at IS NOT NULL
        FROM public.integrations
        WHERE id = (
            SELECT integration_id FROM integration_test_context
        )
    ),
    'provider can be disabled with an audit timestamp'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.run_google_places_discovery_intake(
        (SELECT workspace_id FROM integration_test_context),
        '{"run_name":"Disabled provider"}'::jsonb,
        '[{
          "company_name":"Disabled Provider Candidate",
          "external_reference":"ChIJDisabled"
        }]'::jsonb
    )$$,
    '22023',
    'disabled provider cannot stage a provider discovery run'
);

SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.activities activity
        JOIN integration_test_context context
          ON context.integration_id = activity.entity_id
        WHERE activity.entity_type = 'integration'
          AND activity.action IN (
              'integration_enabled',
              'integration_disabled'
          )
    ) = 2
    AND (
        SELECT count(*)
        FROM public.notifications notification
        JOIN public.activities activity
          ON activity.id = notification.activity_id
        JOIN integration_test_context context
          ON context.integration_id = activity.entity_id
        WHERE activity.entity_type = 'integration'
    ) = 2,
    'integration state changes are audited and notified'
);

RESET ROLE;
SELECT set_config(
    'request.jwt.claim.sub',
    '9a000000-0000-4000-8000-000000000002',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'integration-member@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '9a000000-0000-4000-8000-000000000002',
        'email', 'integration-member@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.integrations
        WHERE id = (
            SELECT integration_id FROM integration_test_context
        )
    ) = 1
    AND (
        SELECT count(*)
        FROM public.lead_external_references
        WHERE lead_id = (
            SELECT imported_lead_id FROM integration_test_context
        )
    ) = 1,
    'active member may read integration state and external references'
);
SELECT pg_temp.expect_sqlstate(
    $$SELECT * FROM public.set_workspace_integration_enabled(
        (SELECT workspace_id FROM integration_test_context),
        'google',
        TRUE
    )$$,
    '42501',
    'member without integration permission cannot enable providers'
);
RESET ROLE;

UPDATE public.workspace_members
SET deleted_at = NOW()
WHERE id = (SELECT member_id FROM integration_test_context);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.integrations
        WHERE id = (
            SELECT integration_id FROM integration_test_context
        )
    ) = 0
    AND (
        SELECT count(*)
        FROM public.lead_external_references
        WHERE lead_id = (
            SELECT imported_lead_id FROM integration_test_context
        )
    ) = 0,
    'soft-deleted member loses provider visibility'
);
RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    '9a000000-0000-4000-8000-000000000003',
    true
);
SELECT set_config(
    'request.jwt.claim.email',
    'integration-outsider@coldingrod.test',
    true
);
SELECT set_config(
    'request.jwt.claims',
    jsonb_build_object(
        'sub', '9a000000-0000-4000-8000-000000000003',
        'email', 'integration-outsider@coldingrod.test',
        'role', 'authenticated'
    )::TEXT,
    true
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
    (
        SELECT count(*)
        FROM public.integrations
        WHERE id = (
            SELECT integration_id FROM integration_test_context
        )
    ) = 0,
    'workspace outsider cannot read provider state'
);
RESET ROLE;

SELECT
    'PASS' AS phase_4_1_integrations_acceptance,
    'all synthetic Phase 4.1 rows will be rolled back' AS cleanup;
ROLLBACK;
