-- Phase 5.2 functionality repair acceptance test.
-- All synthetic users and data are rolled back.

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE test_context (
    workspace_id UUID,
    note_id UUID,
    lead_id UUID,
    first_client_id UUID,
    second_client_id UUID
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON test_context TO authenticated;
GRANT SELECT ON test_context TO anon;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition BOOLEAN, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT COALESCE(condition, false) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: %', label;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error_like(statement TEXT, label TEXT, expected_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    matched BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF position(lower(expected_text) in lower(SQLERRM)) > 0 THEN
            matched := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT matched THEN
        RAISE EXCEPTION 'EXPECTED ERROR WAS NOT RAISED: %', label;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.expect_zero_rows(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    affected BIGINT;
BEGIN
    EXECUTE statement;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'EXPECTED ZERO AFFECTED ROWS: %, got %', label, affected;
    END IF;
END;
$fn$;

INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
    ('85111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'repair-owner@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Repair Owner'), now(), now()),
    ('85222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'repair-outsider@coldingrod.test', jsonb_build_object(), jsonb_build_object('full_name', 'Repair Outsider'), now(), now());

INSERT INTO test_context (workspace_id, note_id, lead_id)
SELECT w.id,
       '85444444-4444-4444-8444-444444444444',
       '85333333-3333-4333-8333-333333333333'
FROM public.workspaces w
WHERE w.is_personal
  AND w.created_by = '85111111-1111-4111-8111-111111111111';

SELECT pg_temp.assert_true((SELECT count(*) FROM test_context) = 1, 'owner personal workspace exists');

SELECT set_config('request.jwt.claim.sub', '85111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.email', 'repair-owner@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '85111111-1111-4111-8111-111111111111',
    'email', 'repair-owner@coldingrod.test',
    'role', 'authenticated'
)::text, true);

SET LOCAL ROLE authenticated;

INSERT INTO public.leads (
    id, workspace_id, company_name, status, source, website_url, industry
)
SELECT lead_id, workspace_id, 'Repair Conversion Company', 'new', 'referral',
       'https://repair.example', 'Professional Services'
FROM test_context;

INSERT INTO public.activities (
    id, workspace_id, entity_type, entity_id, actor_type, actor_user_id, action, metadata
)
SELECT note_id, workspace_id, 'client',
       '85555555-5555-4555-8555-555555555555',
       'human', '85111111-1111-4111-8111-111111111111', 'note',
       jsonb_build_object('content', 'Original note', 'edited', false)
FROM test_context;

SELECT pg_temp.expect_zero_rows(
    $$UPDATE public.activities SET metadata = jsonb_build_object('content', 'Unsafe direct edit') WHERE id = '85444444-4444-4444-8444-444444444444'$$,
    'direct activity updates remain denied'
);

SELECT public.update_activity_note(
    (SELECT workspace_id FROM test_context),
    'client',
    '85555555-5555-4555-8555-555555555555',
    (SELECT note_id FROM test_context),
    'Safely edited note'
);

SELECT pg_temp.assert_true(
    (SELECT metadata ->> 'content' FROM public.activities WHERE id = (SELECT note_id FROM test_context)) = 'Safely edited note',
    'trusted note update changes only the note metadata'
);
SELECT pg_temp.assert_true(
    (SELECT (metadata ->> 'edited')::boolean FROM public.activities WHERE id = (SELECT note_id FROM test_context)),
    'trusted note update marks the note edited'
);

SELECT public.redact_activity_note(
    (SELECT workspace_id FROM test_context),
    'client',
    '85555555-5555-4555-8555-555555555555',
    (SELECT note_id FROM test_context)
);

SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.activities WHERE id = (SELECT note_id FROM test_context)) = 1,
    'redaction preserves the audit row'
);
SELECT pg_temp.assert_true(
    (SELECT metadata ? 'content' FROM public.activities WHERE id = (SELECT note_id FROM test_context)) = false,
    'redaction removes note content'
);
SELECT pg_temp.assert_true(
    (SELECT (metadata ->> 'deleted')::boolean FROM public.activities WHERE id = (SELECT note_id FROM test_context)),
    'redaction records deleted state'
);

UPDATE test_context
SET first_client_id = public.convert_lead_to_client(workspace_id, lead_id);
UPDATE test_context
SET second_client_id = public.convert_lead_to_client(workspace_id, lead_id);

SELECT pg_temp.assert_true(
    (SELECT first_client_id = second_client_id FROM test_context),
    'lead conversion is idempotent'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.clients c JOIN test_context t ON c.id = t.first_client_id
      WHERE c.workspace_id = t.workspace_id
        AND c.name = 'Repair Conversion Company'
        AND c.website = 'https://repair.example'
        AND c.industry = 'Professional Services') = 1,
    'conversion copies the verified business profile into one client'
);
SELECT pg_temp.assert_true(
    (SELECT status FROM public.leads WHERE id = (SELECT lead_id FROM test_context)) = 'won',
    'conversion marks the lead won'
);
SELECT pg_temp.assert_true(
    (SELECT count(*) FROM public.activities a, test_context t
      WHERE a.workspace_id = t.workspace_id
        AND a.entity_type = 'lead'
        AND a.entity_id = t.lead_id
        AND a.action = 'converted_to_client') = 1,
    'conversion records one auditable activity'
);

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '85222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.email', 'repair-outsider@coldingrod.test', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', '85222222-2222-4222-8222-222222222222',
    'email', 'repair-outsider@coldingrod.test',
    'role', 'authenticated'
)::text, true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error_like(
    $$SELECT public.update_activity_note((SELECT workspace_id FROM test_context), 'client', '85555555-5555-4555-8555-555555555555', (SELECT note_id FROM test_context), 'Outsider edit')$$,
    'outsider cannot edit workspace notes',
    'manage_clients permission required'
);
SELECT pg_temp.expect_error_like(
    $$SELECT public.convert_lead_to_client((SELECT workspace_id FROM test_context), (SELECT lead_id FROM test_context))$$,
    'outsider cannot convert workspace leads',
    'manage_leads permission required'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error_like(
    $$SELECT public.convert_lead_to_client((SELECT workspace_id FROM test_context), (SELECT lead_id FROM test_context))$$,
    'anonymous caller cannot execute conversion',
    'permission denied'
);
RESET ROLE;

SELECT 'PASS' AS phase_5_2_functionality_repairs_acceptance,
       'all synthetic data will be rolled back' AS cleanup;
ROLLBACK;
