-- Secure report grounding and contact enrichment for the paired browser
-- companion. The pairing token remains the authorization boundary; provider
-- content is not persisted, only independently verified public destinations.

CREATE OR REPLACE FUNCTION public.browser_extension_get_outreach_basis(
    check_token_hash TEXT,
    check_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    connection_record RECORD;
    result_value JSONB;
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY['manage_ai', 'manage_leads']::TEXT[]
    );

    IF NOT EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = check_lead_id
          AND lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Lead is unavailable in this workspace'
            USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_build_object(
        'lead', jsonb_build_object(
            'id', lead.id,
            'workspace_id', lead.workspace_id,
            'company_name', lead.company_name,
            'source', lead.source,
            'website_url', lead.website_url,
            'industry', lead.industry,
            'location', lead.location,
            'business_email', lead.business_email,
            'business_phone', lead.business_phone
        ),
        'contacts', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', contact.id,
                    'first_name', contact.first_name,
                    'last_name', contact.last_name,
                    'job_title', contact.job_title,
                    'is_primary', contact.is_primary,
                    'email', contact.email,
                    'phone', contact.phone,
                    'linkedin_url', contact.linkedin_url,
                    'instagram_handle', contact.instagram_handle,
                    'facebook_url', contact.facebook_url
                )
                ORDER BY contact.is_primary DESC,
                         contact.created_at,
                         contact.id
            )
            FROM public.lead_contacts contact
            WHERE contact.lead_id = lead.id
        ), '[]'::JSONB),
        'report', (
            SELECT jsonb_build_object(
                'id', report.id,
                'research_summary', report.research_summary,
                'source_urls', report.source_urls,
                'pain_points', report.pain_points,
                'confidence', report.confidence,
                'created_at', report.created_at
            )
            FROM public.lead_research_reports report
            WHERE report.workspace_id = connection_record.workspace_id
              AND report.lead_id = lead.id
            ORDER BY report.created_at DESC, report.id DESC
            LIMIT 1
        ),
        'recent_messages', COALESCE((
            SELECT jsonb_agg(to_jsonb(message_row)
                ORDER BY message_row.created_at DESC)
            FROM (
                SELECT
                    message.platform::TEXT AS platform,
                    message.content,
                    message.created_at
                FROM public.outreach_messages message
                WHERE message.workspace_id = connection_record.workspace_id
                  AND message.lead_id = lead.id
                  AND message.deleted_at IS NULL
                ORDER BY message.created_at DESC
                LIMIT 10
            ) message_row
        ), '[]'::JSONB)
    )
    INTO result_value
    FROM public.leads lead
    WHERE lead.id = check_lead_id
      AND lead.workspace_id = connection_record.workspace_id
      AND lead.deleted_at IS NULL;

    RETURN result_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_prepare_lead_intelligence(
    check_token_hash TEXT,
    check_lead_id UUID,
    input_signals JSONB,
    research_input JSONB,
    contact_input JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    connection_record RECORD;
    contact_record public.lead_contacts%ROWTYPE;
    report_id_value UUID;
    email_value TEXT;
    phone_value TEXT;
    linkedin_value TEXT;
    instagram_value TEXT;
    facebook_value TEXT;
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY['manage_ai', 'manage_leads']::TEXT[]
    );

    IF NOT EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = check_lead_id
          AND lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Lead is unavailable in this workspace'
            USING ERRCODE = '22023';
    END IF;

    IF contact_input IS NULL
       OR jsonb_typeof(contact_input) <> 'object'
       OR EXISTS (
           SELECT 1
           FROM jsonb_object_keys(contact_input) supplied_key
           WHERE supplied_key NOT IN (
               'email', 'phone', 'linkedin_url',
               'instagram_handle', 'facebook_url'
           )
       )
    THEN
        RAISE EXCEPTION 'Public contact input is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_each(contact_input) field
        WHERE jsonb_typeof(field.value) NOT IN ('string', 'null')
    ) THEN
        RAISE EXCEPTION 'Public contact fields must be text'
            USING ERRCODE = '22023';
    END IF;

    email_value := NULLIF(lower(btrim(contact_input ->> 'email')), '');
    phone_value := NULLIF(btrim(contact_input ->> 'phone'), '');
    linkedin_value := NULLIF(btrim(contact_input ->> 'linkedin_url'), '');
    instagram_value := NULLIF(
        regexp_replace(btrim(contact_input ->> 'instagram_handle'), '^@', ''),
        ''
    );
    facebook_value := NULLIF(btrim(contact_input ->> 'facebook_url'), '');

    IF email_value IS NOT NULL AND (
        char_length(email_value) > 320
        OR email_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) THEN
        RAISE EXCEPTION 'Public email is invalid' USING ERRCODE = '22023';
    END IF;
    IF phone_value IS NOT NULL AND char_length(phone_value) > 80 THEN
        RAISE EXCEPTION 'Public phone is invalid' USING ERRCODE = '22023';
    END IF;
    IF linkedin_value IS NOT NULL AND (
        char_length(linkedin_value) > 500
        OR linkedin_value !~* '^https?://([a-z0-9-]+\.)?linkedin\.com/'
    ) THEN
        RAISE EXCEPTION 'Public LinkedIn URL is invalid' USING ERRCODE = '22023';
    END IF;
    IF instagram_value IS NOT NULL AND (
        char_length(instagram_value) > 100
        OR instagram_value !~ '^[A-Za-z0-9._]+$'
    ) THEN
        RAISE EXCEPTION 'Public Instagram handle is invalid' USING ERRCODE = '22023';
    END IF;
    IF facebook_value IS NOT NULL AND (
        char_length(facebook_value) > 500
        OR facebook_value !~* '^https?://([a-z0-9-]+\.)?facebook\.com/'
    ) THEN
        RAISE EXCEPTION 'Public Facebook URL is invalid' USING ERRCODE = '22023';
    END IF;

    UPDATE public.leads lead
    SET business_email = COALESCE(lead.business_email, email_value),
        business_phone = COALESCE(lead.business_phone, phone_value),
        updated_at = clock_timestamp()
    WHERE lead.id = check_lead_id
      AND lead.workspace_id = connection_record.workspace_id
      AND lead.deleted_at IS NULL
      AND (email_value IS NOT NULL OR phone_value IS NOT NULL);

    SELECT contact.*
    INTO contact_record
    FROM public.lead_contacts contact
    WHERE contact.lead_id = check_lead_id
    ORDER BY contact.is_primary DESC, contact.created_at, contact.id
    LIMIT 1
    FOR UPDATE;

    IF contact_record.id IS NULL AND (
        email_value IS NOT NULL OR phone_value IS NOT NULL
        OR linkedin_value IS NOT NULL OR instagram_value IS NOT NULL
        OR facebook_value IS NOT NULL
    ) THEN
        INSERT INTO public.lead_contacts (
            lead_id, first_name, job_title, is_primary,
            email, phone, linkedin_url, instagram_handle, facebook_url
        )
        SELECT
            lead.id, lead.company_name, 'Business contact', TRUE,
            email_value, phone_value, linkedin_value,
            instagram_value, facebook_value
        FROM public.leads lead
        WHERE lead.id = check_lead_id
          AND lead.workspace_id = connection_record.workspace_id
        RETURNING * INTO contact_record;
    ELSIF contact_record.id IS NOT NULL THEN
        UPDATE public.lead_contacts contact
        SET email = COALESCE(contact.email, email_value),
            phone = COALESCE(contact.phone, phone_value),
            linkedin_url = COALESCE(contact.linkedin_url, linkedin_value),
            instagram_handle = COALESCE(
                contact.instagram_handle, instagram_value
            ),
            facebook_url = COALESCE(contact.facebook_url, facebook_value)
        WHERE contact.id = contact_record.id
          AND contact.lead_id = check_lead_id;
    END IF;

    SELECT report.id
    INTO report_id_value
    FROM public.lead_research_reports report
    WHERE report.workspace_id = connection_record.workspace_id
      AND report.lead_id = check_lead_id
    ORDER BY report.created_at DESC, report.id DESC
    LIMIT 1;

    IF report_id_value IS NULL THEN
        PERFORM pg_catalog.set_config(
            'request.jwt.claim.sub',
            connection_record.user_id::TEXT,
            TRUE
        );
        PERFORM public.run_lead_qualification(
            connection_record.workspace_id,
            check_lead_id,
            input_signals
        );
        PERFORM public.run_lead_research(
            connection_record.workspace_id,
            check_lead_id,
            research_input
        );
        PERFORM public.finalize_automatic_lead_research(
            connection_record.workspace_id,
            check_lead_id
        );

        SELECT report.id
        INTO report_id_value
        FROM public.lead_research_reports report
        WHERE report.workspace_id = connection_record.workspace_id
          AND report.lead_id = check_lead_id
        ORDER BY report.created_at DESC, report.id DESC
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'lead_id', check_lead_id,
        'report_id', report_id_value,
        'contact_enriched', contact_record.id IS NOT NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.browser_extension_get_outreach_basis(TEXT, UUID)
    FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.browser_extension_prepare_lead_intelligence(
    TEXT, UUID, JSONB, JSONB, JSONB
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.browser_extension_get_outreach_basis(TEXT, UUID)
    TO anon;
GRANT EXECUTE ON FUNCTION public.browser_extension_prepare_lead_intelligence(
    TEXT, UUID, JSONB, JSONB, JSONB
) TO anon;

COMMENT ON FUNCTION public.browser_extension_get_outreach_basis(TEXT, UUID) IS
    'Returns the paired user''s latest executive summary, detailed analysis, contacts, and recent drafts for one workspace lead.';
COMMENT ON FUNCTION public.browser_extension_prepare_lead_intelligence(
    TEXT, UUID, JSONB, JSONB, JSONB
) IS
    'Uses a valid paired-browser token to persist independently verified public contact channels and create missing lead reports.';
