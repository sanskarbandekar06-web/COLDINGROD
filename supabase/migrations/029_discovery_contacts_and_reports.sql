-- ==========================================
-- 029_discovery_contacts_and_reports.sql
-- Carry verified discovery contact details into outreach-ready contacts.
-- Preserve supported public social profiles with discovery candidates.
-- ==========================================

ALTER TABLE public.lead_contacts
    ADD COLUMN IF NOT EXISTS facebook_url TEXT;

ALTER TABLE public.lead_contacts
    DROP CONSTRAINT IF EXISTS lead_contacts_facebook_url_length;
ALTER TABLE public.lead_contacts
    ADD CONSTRAINT lead_contacts_facebook_url_length
    CHECK (facebook_url IS NULL OR char_length(facebook_url) <= 500);

ALTER TABLE public.lead_discovery_candidates
    ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
    ADD COLUMN IF NOT EXISTS facebook_url TEXT;

ALTER TABLE public.lead_discovery_candidates
    DROP CONSTRAINT IF EXISTS lead_discovery_candidates_linkedin_length;
ALTER TABLE public.lead_discovery_candidates
    ADD CONSTRAINT lead_discovery_candidates_linkedin_length
    CHECK (linkedin_url IS NULL OR char_length(linkedin_url) <= 500);

ALTER TABLE public.lead_discovery_candidates
    DROP CONSTRAINT IF EXISTS lead_discovery_candidates_instagram_length;
ALTER TABLE public.lead_discovery_candidates
    ADD CONSTRAINT lead_discovery_candidates_instagram_length
    CHECK (instagram_handle IS NULL OR char_length(instagram_handle) <= 100);

ALTER TABLE public.lead_discovery_candidates
    DROP CONSTRAINT IF EXISTS lead_discovery_candidates_facebook_length;
ALTER TABLE public.lead_discovery_candidates
    ADD CONSTRAINT lead_discovery_candidates_facebook_length
    CHECK (facebook_url IS NULL OR char_length(facebook_url) <= 500);

CREATE OR REPLACE FUNCTION public.sync_lead_business_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_contact_id UUID;
    previous_company_name TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        previous_company_name := OLD.company_name;
    END IF;
    IF NEW.deleted_at IS NOT NULL
       OR (
           NULLIF(btrim(NEW.business_email), '') IS NULL
           AND NULLIF(btrim(NEW.business_phone), '') IS NULL
       )
    THEN
        RETURN NEW;
    END IF;

    SELECT contact.id
    INTO target_contact_id
    FROM public.lead_contacts contact
    WHERE contact.lead_id = NEW.id
    ORDER BY contact.is_primary DESC, contact.created_at, contact.id
    LIMIT 1;

    IF target_contact_id IS NULL THEN
        INSERT INTO public.lead_contacts (
            lead_id,
            first_name,
            job_title,
            is_primary,
            email,
            phone
        )
        VALUES (
            NEW.id,
            NEW.company_name,
            'Business contact',
            TRUE,
            NULLIF(btrim(NEW.business_email), ''),
            NULLIF(btrim(NEW.business_phone), '')
        );
    ELSE
        UPDATE public.lead_contacts
        SET
            email = COALESCE(
                NULLIF(btrim(email), ''),
                NULLIF(btrim(NEW.business_email), '')
            ),
            phone = COALESCE(
                NULLIF(btrim(phone), ''),
                NULLIF(btrim(NEW.business_phone), '')
            ),
            first_name = CASE
                WHEN job_title = 'Business contact'
                     AND first_name = previous_company_name
                THEN NEW.company_name
                ELSE first_name
            END
        WHERE id = target_contact_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lead_business_contact()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_lead_business_contact ON public.leads;
CREATE TRIGGER sync_lead_business_contact
AFTER INSERT OR UPDATE OF company_name, business_email, business_phone, deleted_at
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_business_contact();

-- Existing discovery/manual leads immediately become reachable without the
-- owner re-entering contact details.
INSERT INTO public.lead_contacts (
    lead_id,
    first_name,
    job_title,
    is_primary,
    email,
    phone
)
SELECT
    lead.id,
    lead.company_name,
    'Business contact',
    TRUE,
    NULLIF(btrim(lead.business_email), ''),
    NULLIF(btrim(lead.business_phone), '')
FROM public.leads lead
WHERE lead.deleted_at IS NULL
  AND (
      NULLIF(btrim(lead.business_email), '') IS NOT NULL
      OR NULLIF(btrim(lead.business_phone), '') IS NOT NULL
  )
  AND NOT EXISTS (
      SELECT 1
      FROM public.lead_contacts contact
      WHERE contact.lead_id = lead.id
  );

UPDATE public.lead_contacts contact
SET
    email = COALESCE(
        NULLIF(btrim(contact.email), ''),
        NULLIF(btrim(lead.business_email), '')
    ),
    phone = COALESCE(
        NULLIF(btrim(contact.phone), ''),
        NULLIF(btrim(lead.business_phone), '')
    )
FROM public.leads lead
WHERE lead.id = contact.lead_id
  AND lead.deleted_at IS NULL
  AND contact.id = (
      SELECT selected.id
      FROM public.lead_contacts selected
      WHERE selected.lead_id = lead.id
      ORDER BY selected.is_primary DESC, selected.created_at, selected.id
      LIMIT 1
  );

CREATE OR REPLACE FUNCTION public.sync_imported_candidate_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    imported_lead public.leads%ROWTYPE;
    target_contact_id UUID;
BEGIN
    IF NEW.status <> 'imported' OR NEW.imported_lead_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT lead.*
    INTO imported_lead
    FROM public.leads lead
    WHERE lead.id = NEW.imported_lead_id
      AND lead.workspace_id = NEW.workspace_id
      AND lead.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT contact.id
    INTO target_contact_id
    FROM public.lead_contacts contact
    WHERE contact.lead_id = imported_lead.id
    ORDER BY contact.is_primary DESC, contact.created_at, contact.id
    LIMIT 1;

    IF target_contact_id IS NULL THEN
        INSERT INTO public.lead_contacts (
            lead_id,
            first_name,
            job_title,
            is_primary,
            email,
            phone,
            linkedin_url,
            instagram_handle,
            facebook_url
        )
        VALUES (
            imported_lead.id,
            imported_lead.company_name,
            'Business contact',
            TRUE,
            NULLIF(btrim(imported_lead.business_email), ''),
            NULLIF(btrim(imported_lead.business_phone), ''),
            NULLIF(btrim(NEW.linkedin_url), ''),
            NULLIF(btrim(NEW.instagram_handle), ''),
            NULLIF(btrim(NEW.facebook_url), '')
        );
    ELSE
        UPDATE public.lead_contacts
        SET
            email = COALESCE(
                NULLIF(btrim(email), ''),
                NULLIF(btrim(imported_lead.business_email), '')
            ),
            phone = COALESCE(
                NULLIF(btrim(phone), ''),
                NULLIF(btrim(imported_lead.business_phone), '')
            ),
            linkedin_url = COALESCE(
                NULLIF(btrim(linkedin_url), ''),
                NULLIF(btrim(NEW.linkedin_url), '')
            ),
            instagram_handle = COALESCE(
                NULLIF(btrim(instagram_handle), ''),
                NULLIF(btrim(NEW.instagram_handle), '')
            ),
            facebook_url = COALESCE(
                NULLIF(btrim(facebook_url), ''),
                NULLIF(btrim(NEW.facebook_url), '')
            )
        WHERE id = target_contact_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_imported_candidate_contact()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_imported_candidate_contact
ON public.lead_discovery_candidates;
CREATE TRIGGER sync_imported_candidate_contact
AFTER UPDATE OF
    status,
    imported_lead_id,
    linkedin_url,
    instagram_handle,
    facebook_url
ON public.lead_discovery_candidates
FOR EACH ROW
EXECUTE FUNCTION public.sync_imported_candidate_contact();

CREATE OR REPLACE FUNCTION public.run_enriched_lead_discovery_intake(
    check_workspace_id UUID,
    intake_brief JSONB,
    intake_candidates JSONB
)
RETURNS TABLE (
    run_id UUID,
    action_id UUID,
    candidate_count INTEGER,
    ready_count INTEGER,
    duplicate_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    supplied_candidate JSONB;
    source_position INTEGER;
    stripped_candidates JSONB;
    discovery_result RECORD;
    linkedin_value TEXT;
    instagram_value TEXT;
    facebook_value TEXT;
BEGIN
    IF intake_candidates IS NULL
       OR jsonb_typeof(intake_candidates) <> 'array'
       OR jsonb_array_length(intake_candidates) NOT BETWEEN 1 AND 50
    THEN
        RAISE EXCEPTION 'Supply between 1 and 50 discovery candidates'
            USING ERRCODE = '22023';
    END IF;

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        IF jsonb_typeof(supplied_candidate) <> 'object' THEN
            RAISE EXCEPTION 'Every discovery candidate must be an object'
                USING ERRCODE = '22023';
        END IF;

        linkedin_value := NULLIF(btrim(supplied_candidate ->> 'linkedin_url'), '');
        instagram_value := NULLIF(
            regexp_replace(
                btrim(supplied_candidate ->> 'instagram_handle'),
                '^@',
                ''
            ),
            ''
        );
        facebook_value := NULLIF(btrim(supplied_candidate ->> 'facebook_url'), '');

        IF linkedin_value IS NOT NULL AND (
            char_length(linkedin_value) > 500
            OR linkedin_value !~* '^https?://([a-z0-9-]+\.)?linkedin\.com/'
        ) THEN
            RAISE EXCEPTION 'LinkedIn profile URL is invalid'
                USING ERRCODE = '22023';
        END IF;
        IF instagram_value IS NOT NULL AND (
            char_length(instagram_value) > 100
            OR instagram_value !~ '^[A-Za-z0-9._]+$'
        ) THEN
            RAISE EXCEPTION 'Instagram handle is invalid'
                USING ERRCODE = '22023';
        END IF;
        IF facebook_value IS NOT NULL AND (
            char_length(facebook_value) > 500
            OR facebook_value !~* '^https?://([a-z0-9-]+\.)?facebook\.com/'
        ) THEN
            RAISE EXCEPTION 'Facebook profile URL is invalid'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT jsonb_agg(
        candidate_value
            - 'linkedin_url'
            - 'instagram_handle'
            - 'facebook_url'
        ORDER BY ordinal_position
    )
    INTO stripped_candidates
    FROM jsonb_array_elements(intake_candidates)
        WITH ORDINALITY AS candidate_rows(
            candidate_value, ordinal_position
        );

    SELECT *
    INTO discovery_result
    FROM public.run_lead_discovery_intake(
        check_workspace_id,
        intake_brief,
        stripped_candidates
    );

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        UPDATE public.lead_discovery_candidates candidate
        SET
            linkedin_url = NULLIF(btrim(supplied_candidate ->> 'linkedin_url'), ''),
            instagram_handle = NULLIF(
                regexp_replace(
                    btrim(supplied_candidate ->> 'instagram_handle'),
                    '^@',
                    ''
                ),
                ''
            ),
            facebook_url = NULLIF(btrim(supplied_candidate ->> 'facebook_url'), '')
        WHERE candidate.run_id = discovery_result.run_id
          AND candidate.workspace_id = check_workspace_id
          AND candidate.source_index = source_position;
    END LOOP;

    RETURN QUERY SELECT
        discovery_result.run_id,
        discovery_result.action_id,
        discovery_result.candidate_count,
        discovery_result.ready_count,
        discovery_result.duplicate_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_enriched_lead_discovery_intake(
    UUID, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_enriched_lead_discovery_intake(
    UUID, JSONB, JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_enriched_google_places_discovery_intake(
    check_workspace_id UUID,
    intake_brief JSONB,
    intake_candidates JSONB
)
RETURNS TABLE (
    run_id UUID,
    action_id UUID,
    candidate_count INTEGER,
    ready_count INTEGER,
    duplicate_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    supplied_candidate JSONB;
    source_position INTEGER;
    stripped_candidates JSONB;
    discovery_result RECORD;
    linkedin_value TEXT;
    instagram_value TEXT;
    facebook_value TEXT;
BEGIN
    IF intake_candidates IS NULL
       OR jsonb_typeof(intake_candidates) <> 'array'
       OR jsonb_array_length(intake_candidates) NOT BETWEEN 1 AND 50
    THEN
        RAISE EXCEPTION 'Supply between 1 and 50 Google Places candidates'
            USING ERRCODE = '22023';
    END IF;

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        linkedin_value := NULLIF(btrim(supplied_candidate ->> 'linkedin_url'), '');
        instagram_value := NULLIF(
            regexp_replace(
                btrim(supplied_candidate ->> 'instagram_handle'),
                '^@',
                ''
            ),
            ''
        );
        facebook_value := NULLIF(btrim(supplied_candidate ->> 'facebook_url'), '');

        IF linkedin_value IS NOT NULL AND (
            char_length(linkedin_value) > 500
            OR linkedin_value !~* '^https?://([a-z0-9-]+\.)?linkedin\.com/'
        ) THEN
            RAISE EXCEPTION 'LinkedIn profile URL is invalid'
                USING ERRCODE = '22023';
        END IF;
        IF instagram_value IS NOT NULL AND (
            char_length(instagram_value) > 100
            OR instagram_value !~ '^[A-Za-z0-9._]+$'
        ) THEN
            RAISE EXCEPTION 'Instagram handle is invalid'
                USING ERRCODE = '22023';
        END IF;
        IF facebook_value IS NOT NULL AND (
            char_length(facebook_value) > 500
            OR facebook_value !~* '^https?://([a-z0-9-]+\.)?facebook\.com/'
        ) THEN
            RAISE EXCEPTION 'Facebook profile URL is invalid'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT jsonb_agg(
        candidate_value
            - 'linkedin_url'
            - 'instagram_handle'
            - 'facebook_url'
        ORDER BY ordinal_position
    )
    INTO stripped_candidates
    FROM jsonb_array_elements(intake_candidates)
        WITH ORDINALITY AS candidate_rows(
            candidate_value, ordinal_position
        );

    SELECT *
    INTO discovery_result
    FROM public.run_google_places_discovery_intake(
        check_workspace_id,
        intake_brief,
        stripped_candidates
    );

    FOR supplied_candidate, source_position IN
        SELECT candidate_value, ordinal_position::INTEGER
        FROM jsonb_array_elements(intake_candidates)
            WITH ORDINALITY AS candidate_rows(
                candidate_value, ordinal_position
            )
    LOOP
        UPDATE public.lead_discovery_candidates candidate
        SET
            linkedin_url = NULLIF(btrim(supplied_candidate ->> 'linkedin_url'), ''),
            instagram_handle = NULLIF(
                regexp_replace(
                    btrim(supplied_candidate ->> 'instagram_handle'),
                    '^@',
                    ''
                ),
                ''
            ),
            facebook_url = NULLIF(btrim(supplied_candidate ->> 'facebook_url'), '')
        WHERE candidate.run_id = discovery_result.run_id
          AND candidate.workspace_id = check_workspace_id
          AND candidate.source_index = source_position;
    END LOOP;

    RETURN QUERY SELECT
        discovery_result.run_id,
        discovery_result.action_id,
        discovery_result.candidate_count,
        discovery_result.ready_count,
        discovery_result.duplicate_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_enriched_google_places_discovery_intake(
    UUID, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_enriched_google_places_discovery_intake(
    UUID, JSONB, JSONB
) TO authenticated;

COMMENT ON COLUMN public.lead_contacts.facebook_url IS
    'Verified public Facebook page used for provider-safe outreach handoff.';
COMMENT ON FUNCTION public.run_enriched_lead_discovery_intake(
    UUID, JSONB, JSONB
) IS 'Runs discovery while preserving verified public social destinations.';
