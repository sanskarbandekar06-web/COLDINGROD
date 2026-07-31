BEGIN;

DO $$
DECLARE
    meeting_policy_count INTEGER;
    participant_policy_count INTEGER;
BEGIN
    SELECT count(*)
    INTO meeting_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meetings'
      AND cmd = 'SELECT';

    IF meeting_policy_count <> 1 THEN
        RAISE EXCEPTION
            'Expected one consolidated meeting SELECT policy, found %',
            meeting_policy_count;
    END IF;

    SELECT count(*)
    INTO participant_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'meeting_participants'
      AND cmd = 'SELECT';

    IF participant_policy_count <> 1 THEN
        RAISE EXCEPTION
            'Expected one consolidated meeting participant SELECT policy, found %',
            participant_policy_count;
    END IF;

    -- Supabase's advisor is the authoritative init-plan check. This assertion
    -- protects the intended policy rewrites from being removed entirely.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              COALESCE(qual, '') LIKE '%SELECT auth.uid()%'
              OR COALESCE(with_check, '') LIKE '%SELECT auth.uid()%'
          )
    ) THEN
        RAISE EXCEPTION 'Expected optimized auth.uid() policy expressions';
    END IF;
END;
$$;

ROLLBACK;
