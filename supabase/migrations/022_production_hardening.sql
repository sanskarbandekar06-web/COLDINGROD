-- Phase 5.1: production database hardening.
-- This migration preserves authorization behavior while reducing repeated
-- auth.uid() evaluation, consolidating duplicate SELECT policies, and making
-- constant types explicit for PL/pgSQL linting.

DO $$
DECLARE
    active_policy TEXT;
    archived_policy TEXT;
BEGIN
    SELECT qual
    INTO active_policy
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meetings'
      AND policyname = 'Active members can view active meetings';

    SELECT qual
    INTO archived_policy
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meetings'
      AND policyname = 'manage_meetings can view archived meetings';

    IF active_policy IS NULL OR archived_policy IS NULL THEN
        RAISE EXCEPTION 'Expected meeting SELECT policies were not found';
    END IF;

    DROP POLICY "Active members can view active meetings" ON public.meetings;
    DROP POLICY "manage_meetings can view archived meetings" ON public.meetings;

    EXECUTE format(
        'CREATE POLICY %I ON public.meetings FOR SELECT USING ((%s) OR (%s))',
        'Members can view permitted meetings',
        active_policy,
        archived_policy
    );

    SELECT qual
    INTO active_policy
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_participants'
      AND policyname = 'Active members can view active meeting participants';

    SELECT qual
    INTO archived_policy
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_participants'
      AND policyname = 'manage_meetings can view archived meeting participants';

    IF active_policy IS NULL OR archived_policy IS NULL THEN
        RAISE EXCEPTION 'Expected meeting participant SELECT policies were not found';
    END IF;

    DROP POLICY "Active members can view active meeting participants"
        ON public.meeting_participants;
    DROP POLICY "manage_meetings can view archived meeting participants"
        ON public.meeting_participants;

    EXECUTE format(
        'CREATE POLICY %I ON public.meeting_participants FOR SELECT USING ((%s) OR (%s))',
        'Members can view permitted meeting participants',
        active_policy,
        archived_policy
    );
END;
$$;

DO $$
DECLARE
    policy_record RECORD;
    using_clause TEXT;
    check_clause TEXT;
    statement TEXT;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              COALESCE(qual, '') LIKE '%auth.uid()%'
              OR COALESCE(with_check, '') LIKE '%auth.uid()%'
          )
        ORDER BY tablename, policyname
    LOOP
        using_clause := replace(
            policy_record.qual,
            'auth.uid()',
            '(SELECT auth.uid())'
        );
        check_clause := replace(
            policy_record.with_check,
            'auth.uid()',
            '(SELECT auth.uid())'
        );

        statement := format(
            'ALTER POLICY %I ON %I.%I',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename
        );

        IF using_clause IS NOT NULL THEN
            statement := statement || format(' USING (%s)', using_clause);
        END IF;

        IF check_clause IS NOT NULL THEN
            statement := statement || format(' WITH CHECK (%s)', check_clause);
        END IF;

        EXECUTE statement;
    END LOOP;
END;
$$;

DO $$
DECLARE
    rewrite RECORD;
    function_oid REGPROCEDURE;
    definition TEXT;
    rewritten_definition TEXT;
    quoted_agent_id TEXT;
BEGIN
    FOR rewrite IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.run_lead_qualification(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000301'
                ),
                (
                    'public.run_lead_discovery_intake(uuid,jsonb,jsonb)',
                    '00000000-0000-4000-8000-000000000302'
                ),
                (
                    'public.import_lead_discovery_candidates(uuid,uuid,uuid[])',
                    '00000000-0000-4000-8000-000000000302'
                ),
                (
                    'public.run_lead_research(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000303'
                ),
                (
                    'public.run_lead_research(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000304'
                ),
                (
                    'public.generate_personalized_outreach(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000305'
                ),
                (
                    'public.generate_personalized_outreach(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000306'
                ),
                (
                    'public.create_follow_up_sequence(uuid,uuid,jsonb)',
                    '00000000-0000-4000-8000-000000000307'
                ),
                (
                    'public.prepare_due_follow_up(uuid,uuid)',
                    '00000000-0000-4000-8000-000000000307'
                ),
                (
                    'public.prepare_due_follow_up(uuid,uuid)',
                    '00000000-0000-4000-8000-000000000306'
                ),
                (
                    'public.run_workspace_analytics(uuid,integer)',
                    '00000000-0000-4000-8000-000000000308'
                )
        ) AS replacements(function_signature, agent_id)
    LOOP
        function_oid := to_regprocedure(rewrite.function_signature);

        IF function_oid IS NULL THEN
            RAISE EXCEPTION 'Expected function not found: %', rewrite.function_signature;
        END IF;

        definition := pg_get_functiondef(function_oid);
        quoted_agent_id := quote_literal(rewrite.agent_id);
        rewritten_definition := replace(
            definition,
            quoted_agent_id,
            quoted_agent_id || '::UUID'
        );

        IF rewritten_definition = definition THEN
            RAISE EXCEPTION
                'Expected agent constant not found in function %',
                rewrite.function_signature;
        END IF;

        EXECUTE rewritten_definition;
    END LOOP;

    function_oid :=
        'public.run_lead_qualification(uuid,uuid,jsonb)'::REGPROCEDURE;
    definition := pg_get_functiondef(function_oid);
    rewritten_definition := replace(
        definition,
        '    existing_lead public.leads%ROWTYPE;' || E'\n',
        ''
    );
    rewritten_definition := replace(
        rewritten_definition,
        E'    SELECT lead.*\n    INTO existing_lead\n',
        E'    PERFORM 1\n'
    );
    rewritten_definition := replace(
        rewritten_definition,
        'calculated_priority public.ai_action_priority := ''normal'';',
        'calculated_priority public.ai_action_priority := ''normal''::public.ai_action_priority;'
    );

    IF rewritten_definition = definition THEN
        RAISE EXCEPTION 'Lead qualification lint rewrites were not applied';
    END IF;

    EXECUTE rewritten_definition;

    function_oid :=
        'public.generate_personalized_outreach(uuid,uuid,jsonb)'::REGPROCEDURE;
    definition := pg_get_functiondef(function_oid);
    rewritten_definition := replace(
        definition,
        '    created_activity_id UUID;' || E'\n',
        ''
    );
    rewritten_definition := replace(
        rewritten_definition,
        E'\n    RETURNING id INTO created_activity_id;',
        ';'
    );

    IF rewritten_definition = definition THEN
        RAISE EXCEPTION 'Outreach activity lint rewrite was not applied';
    END IF;

    EXECUTE rewritten_definition;
END;
$$;
