-- Keep telephone, WhatsApp, and owner identity separate. Historical phone
-- values are retained; none are promoted to WhatsApp or owner numbers.
ALTER TABLE public.lead_contacts
  ADD COLUMN phone_type TEXT NOT NULL DEFAULT 'unknown' CHECK (phone_type IN ('unknown','mobile','landline')),
  ADD COLUMN whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN whatsapp_status TEXT NOT NULL DEFAULT 'unknown' CHECK (whatsapp_status IN ('unknown','published','confirmed','unavailable')),
  ADD COLUMN whatsapp_source_url TEXT,
  ADD COLUMN contact_kind TEXT NOT NULL DEFAULT 'person' CHECK (contact_kind IN ('business','person','owner')),
  ADD COLUMN source_url TEXT,
  ADD COLUMN checked_at TIMESTAMPTZ,
  ADD COLUMN contact_evidence JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(contact_evidence) = 'array'),
  ADD CONSTRAINT whatsapp_evidence_required CHECK (
    whatsapp_status NOT IN ('published','confirmed') OR
    (whatsapp_number IS NOT NULL AND (whatsapp_status = 'confirmed' OR (whatsapp_source_url IS NOT NULL AND whatsapp_source_url ~ '^https?://')))
  );

ALTER TABLE public.leads ADD COLUMN contact_research JSONB NOT NULL DEFAULT '{}';
UPDATE public.lead_contacts SET contact_kind = 'business'
WHERE job_title = 'Business contact';

CREATE OR REPLACE FUNCTION public.save_public_contact_research(
  check_workspace_id UUID, check_lead_id UUID, profile_input JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  lead_record public.leads%ROWTYPE;
  contact_id_value UUID;
  owner_value JSONB;
  result_value JSONB;
  source_value TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_permission(check_workspace_id, 'manage_leads') THEN
    RAISE EXCEPTION 'Lead management permission required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO lead_record FROM public.leads WHERE id=check_lead_id AND workspace_id=check_workspace_id AND deleted_at IS NULL FOR UPDATE;
  IF lead_record.id IS NULL THEN RAISE EXCEPTION 'Lead unavailable' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(profile_input) IS DISTINCT FROM 'object' OR octet_length(profile_input::TEXT)>60000 THEN
    RAISE EXCEPTION 'Invalid public contact research' USING ERRCODE='22023';
  END IF;
  source_value := NULLIF(profile_input->>'finalUrl','');
  IF source_value IS NOT NULL AND source_value !~ '^https?://' THEN
    RAISE EXCEPTION 'Invalid research source' USING ERRCODE='22023';
  END IF;
  SELECT id INTO contact_id_value FROM public.lead_contacts
  WHERE lead_id=check_lead_id AND contact_kind='business' ORDER BY created_at, id LIMIT 1 FOR UPDATE;
  IF contact_id_value IS NULL AND (
    NULLIF(profile_input->>'phone','') IS NOT NULL OR NULLIF(profile_input->>'email','') IS NOT NULL OR
    NULLIF(profile_input->>'whatsappNumber','') IS NOT NULL OR NULLIF(profile_input->>'linkedinUrl','') IS NOT NULL OR
    NULLIF(profile_input->>'instagramHandle','') IS NOT NULL OR NULLIF(profile_input->>'facebookUrl','') IS NOT NULL
  ) THEN
    INSERT INTO public.lead_contacts(lead_id,first_name,job_title,contact_kind,is_primary)
    VALUES(check_lead_id,lead_record.company_name,'Business contact','business',
      NOT EXISTS(SELECT 1 FROM public.lead_contacts WHERE lead_id=check_lead_id)) RETURNING id INTO contact_id_value;
  END IF;
  IF contact_id_value IS NOT NULL THEN
    UPDATE public.lead_contacts SET
      phone=COALESCE(phone,NULLIF(profile_input->>'phone','')),
      phone_type=CASE WHEN phone IS NULL OR phone=profile_input->>'phone' THEN COALESCE(profile_input->>'phoneType','unknown') ELSE phone_type END,
      email=COALESCE(email,NULLIF(profile_input->>'email','')),
      linkedin_url=COALESCE(linkedin_url,NULLIF(profile_input->>'linkedinUrl','')),
      instagram_handle=COALESCE(instagram_handle,NULLIF(profile_input->>'instagramHandle','')),
      facebook_url=COALESCE(facebook_url,NULLIF(profile_input->>'facebookUrl','')),
      whatsapp_number=CASE WHEN whatsapp_status IN ('confirmed','unavailable') THEN whatsapp_number ELSE NULLIF(profile_input->>'whatsappNumber','') END,
      whatsapp_source_url=CASE WHEN whatsapp_status IN ('confirmed','unavailable') THEN whatsapp_source_url ELSE NULLIF(profile_input->>'whatsappSourceUrl','') END,
      whatsapp_status=CASE WHEN whatsapp_status IN ('confirmed','unavailable') THEN whatsapp_status WHEN NULLIF(profile_input->>'whatsappNumber','') IS NOT NULL THEN 'published' ELSE 'unknown' END,
      source_url=COALESCE(source_value,source_url), checked_at=clock_timestamp(),
      contact_evidence=COALESCE(profile_input->'contactEvidence','[]'::JSONB)
    WHERE id=contact_id_value;
  END IF;
  FOR owner_value IN SELECT value FROM jsonb_array_elements(COALESCE(profile_input->'owners','[]')) LIMIT 5 LOOP
    IF NULLIF(owner_value->>'name','') IS NULL OR owner_value->>'sourceUrl' !~ '^https?://'
      OR NULLIF(owner_value->>'sourceUrl','') IS NULL
      OR COALESCE(owner_value->>'role','') !~* '(owner|founder|proprietor)'
      OR (NULLIF(owner_value->>'phone','') IS NULL AND NULLIF(owner_value->>'email','') IS NULL AND NULLIF(owner_value->>'whatsappNumber','') IS NULL)
    THEN CONTINUE; END IF;
    SELECT id INTO contact_id_value FROM public.lead_contacts WHERE lead_id=check_lead_id
      AND contact_kind='owner' AND lower(first_name)=lower(owner_value->>'name') ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF contact_id_value IS NULL THEN
      INSERT INTO public.lead_contacts(lead_id,first_name,job_title,contact_kind,is_primary)
      VALUES(check_lead_id,left(owner_value->>'name',140),left(owner_value->>'role',160),'owner',false)
      RETURNING id INTO contact_id_value;
    END IF;
    UPDATE public.lead_contacts SET
      phone=COALESCE(NULLIF(owner_value->>'phone',''),phone),
      phone_type=COALESCE(owner_value->>'phoneType','unknown'),
      email=COALESCE(NULLIF(owner_value->>'email',''),email),
      source_url=owner_value->>'sourceUrl', checked_at=clock_timestamp(),
      contact_evidence=jsonb_build_array(jsonb_build_object('field','owner_identity','value',owner_value->>'name','source_url',owner_value->>'sourceUrl','excerpt',owner_value->>'excerpt')),
      whatsapp_number=CASE WHEN whatsapp_status IN ('confirmed','unavailable') THEN whatsapp_number ELSE NULLIF(owner_value->>'whatsappNumber','') END,
      whatsapp_status=CASE WHEN whatsapp_status IN ('confirmed','unavailable') THEN whatsapp_status WHEN NULLIF(owner_value->>'whatsappNumber','') IS NOT NULL THEN 'published' ELSE 'unknown' END,
      whatsapp_source_url=owner_value->>'sourceUrl'
    WHERE id=contact_id_value;
  END LOOP;
  UPDATE public.leads SET
    business_phone=COALESCE(business_phone,NULLIF(profile_input->>'phone','')),
    business_email=COALESCE(business_email,NULLIF(profile_input->>'email','')),
    contact_research=jsonb_build_object('checked_at',clock_timestamp(),'source_urls',COALESCE(profile_input->'sourceUrls','[]'),
      'owner_found',jsonb_array_length(COALESCE(profile_input->'owners','[]'))>0,
      'search_status',profile_input->>'searchStatus','analysis_error',profile_input->>'analysisError')
  WHERE id=check_lead_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.is_primary DESC,c.created_at),'[]') INTO result_value
  FROM public.lead_contacts c WHERE lead_id=check_lead_id;
  RETURN result_value;
END;
$$;
REVOKE ALL ON FUNCTION public.save_public_contact_research(UUID,UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_public_contact_research(UUID,UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.browser_extension_save_contact_research(check_token_hash TEXT,check_lead_id UUID,profile_input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE connection_record RECORD; previous_sub TEXT; result_value JSONB;
BEGIN
  SELECT * INTO connection_record FROM public.browser_extension_require_connection(check_token_hash,ARRAY['manage_leads']::TEXT[]);
  previous_sub := current_setting('request.jwt.claim.sub',TRUE);
  PERFORM set_config('request.jwt.claim.sub',connection_record.user_id::TEXT,TRUE);
  result_value := public.save_public_contact_research(connection_record.workspace_id,check_lead_id,profile_input);
  PERFORM set_config('request.jwt.claim.sub',COALESCE(previous_sub,''),TRUE);
  RETURN result_value;
END;
$$;
REVOKE ALL ON FUNCTION public.browser_extension_save_contact_research(TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browser_extension_save_contact_research(TEXT,UUID,JSONB) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.require_whatsapp_evidence() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.platform='whatsapp' AND NEW.direction='outbound' AND NEW.deleted_at IS NULL
    AND NEW.status IN ('draft','pending_approval','scheduled')
    AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.platform IS DISTINCT FROM OLD.platform)
    AND NOT EXISTS(SELECT 1 FROM public.lead_contacts c WHERE c.id=NEW.contact_id AND c.lead_id=NEW.lead_id
      AND c.whatsapp_number IS NOT NULL AND c.whatsapp_status IN ('published','confirmed'))
  THEN RAISE EXCEPTION 'No published or confirmed WhatsApp number for this contact. Refresh contact research or choose another channel.' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_whatsapp_evidence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER require_whatsapp_evidence BEFORE INSERT OR UPDATE ON public.outreach_messages FOR EACH ROW EXECUTE FUNCTION public.require_whatsapp_evidence();

-- Keep existing RPC authorization and audit behavior while carrying channel evidence.

CREATE OR REPLACE FUNCTION public.browser_extension_create_draft(check_token_hash text, draft_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    connection_record RECORD;
    lead_uuid UUID;
    contact_uuid UUID;
    platform_text TEXT;
    subject_text TEXT;
    content_text TEXT;
    page_url_text TEXT;
    page_title_text TEXT;
    contact_record public.lead_contacts%ROWTYPE;
    created_action_id UUID;
    created_message_id UUID;
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY['manage_leads']::TEXT[]
    );

    IF draft_input IS NULL
       OR jsonb_typeof(draft_input) <> 'object'
    THEN
        RAISE EXCEPTION 'Draft input must be an object'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(draft_input) supplied_key
        WHERE supplied_key NOT IN (
            'lead_id',
            'contact_id',
            'platform',
            'subject',
            'content',
            'page_url',
            'page_title'
        )
    ) THEN
        RAISE EXCEPTION 'Draft input contains an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE(draft_input ->> 'lead_id', '') !~
       '^[0-9a-fA-F-]{36}$'
       OR COALESCE(draft_input ->> 'contact_id', '') !~
       '^[0-9a-fA-F-]{36}$'
    THEN
        RAISE EXCEPTION 'A valid lead and contact are required'
            USING ERRCODE = '22023';
    END IF;

    lead_uuid := (draft_input ->> 'lead_id')::UUID;
    contact_uuid := (draft_input ->> 'contact_id')::UUID;
    platform_text := lower(NULLIF(btrim(draft_input ->> 'platform'), ''));
    subject_text := NULLIF(btrim(draft_input ->> 'subject'), '');
    content_text := NULLIF(btrim(draft_input ->> 'content'), '');
    page_url_text := NULLIF(btrim(draft_input ->> 'page_url'), '');
    page_title_text := NULLIF(btrim(draft_input ->> 'page_title'), '');

    IF platform_text IS NULL
       OR platform_text NOT IN (
           'email',
           'linkedin',
           'whatsapp',
           'instagram',
           'facebook',
           'sms'
       )
    THEN
        RAISE EXCEPTION 'Choose a supported outreach channel'
            USING ERRCODE = '22023';
    END IF;
    IF content_text IS NULL
       OR char_length(content_text) NOT BETWEEN 1 AND 10000
    THEN
        RAISE EXCEPTION
            'Message content must be between 1 and 10000 characters'
            USING ERRCODE = '22023';
    END IF;
    IF subject_text IS NOT NULL
       AND char_length(subject_text) > 500
    THEN
        RAISE EXCEPTION 'Subject must be 500 characters or fewer'
            USING ERRCODE = '22023';
    END IF;
    IF page_url_text IS NOT NULL
       AND (
           char_length(page_url_text) > 2000
           OR page_url_text !~* '^https?://[^[:space:]]+$'
       )
    THEN
        RAISE EXCEPTION 'Active page URL is invalid'
            USING ERRCODE = '22023';
    END IF;
    IF page_title_text IS NOT NULL
       AND char_length(page_title_text) > 500
    THEN
        RAISE EXCEPTION 'Active page title is too long'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = lead_uuid
          AND lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Lead is unavailable in this workspace'
            USING ERRCODE = '22023';
    END IF;

    SELECT contact.*
    INTO contact_record
    FROM public.lead_contacts contact
    WHERE contact.id = contact_uuid
      AND contact.lead_id = lead_uuid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact does not belong to the selected lead'
            USING ERRCODE = '22023';
    END IF;

    IF (platform_text = 'email'
        AND NULLIF(btrim(contact_record.email), '') IS NULL)
       OR (platform_text = 'sms' AND NULLIF(btrim(contact_record.phone), '') IS NULL)
       OR (platform_text = 'whatsapp' AND (contact_record.whatsapp_number IS NULL OR contact_record.whatsapp_status NOT IN ('published','confirmed')))
       OR (platform_text = 'facebook' AND NULLIF(btrim(contact_record.facebook_url), '') IS NULL)
       OR (platform_text = 'linkedin'
        AND NULLIF(btrim(contact_record.linkedin_url), '') IS NULL)
       OR (platform_text = 'instagram'
        AND NULLIF(btrim(contact_record.instagram_handle), '') IS NULL)
    THEN
        RAISE EXCEPTION
            'Selected contact is not reachable on this channel'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.outreach_messages message
        WHERE message.workspace_id = connection_record.workspace_id
          AND message.lead_id = lead_uuid
          AND message.contact_id = contact_uuid
          AND message.platform::TEXT = platform_text
          AND lower(btrim(message.content)) = lower(content_text)
          AND message.status IN (
              'draft',
              'pending_approval',
              'scheduled'
          )
          AND message.created_at >=
              clock_timestamp() - INTERVAL '24 hours'
          AND message.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'An identical active draft already exists for this contact'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.ai_actions (
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        status,
        priority,
        payload,
        created_by
    )
    VALUES (
        connection_record.workspace_id,
        'outreach_message',
        NULL,
        'review_browser_extension_outreach',
        'pending_approval',
        'normal',
        jsonb_build_object(
            'source', 'browser_extension',
            'lead_id', lead_uuid,
            'contact_id', contact_uuid,
            'platform', platform_text,
            'subject', subject_text,
            'content', content_text,
            'page_url', page_url_text,
            'page_title', page_title_text,
            'created_by_user_id', connection_record.user_id,
            'human_approval_required', TRUE
        ),
        connection_record.user_id
    )
    RETURNING id INTO created_action_id;

    INSERT INTO public.outreach_messages (
        workspace_id,
        lead_id,
        contact_id,
        platform,
        direction,
        subject,
        content,
        status,
        ai_action_id
    )
    VALUES (
        connection_record.workspace_id,
        lead_uuid,
        contact_uuid,
        platform_text::public.outreach_platform,
        'outbound',
        subject_text,
        content_text,
        'pending_approval',
        created_action_id
    )
    RETURNING id INTO created_message_id;

    UPDATE public.ai_actions
    SET entity_id = created_message_id,
        result_data = jsonb_build_object(
            'message_id', created_message_id,
            'message_status', 'pending_approval'
        ),
        payload = payload || jsonb_build_object(
            'message_id', created_message_id
        )
    WHERE id = created_action_id;

    INSERT INTO public.message_versions (
        outreach_message_id,
        content,
        edited_by,
        version_number,
        change_reason
    )
    VALUES (
        created_message_id,
        content_text,
        connection_record.user_id,
        1,
        'Created in browser companion'
    );

    INSERT INTO public.activities (
        workspace_id,
        entity_type,
        entity_id,
        actor_type,
        actor_user_id,
        workspace_member_id,
        action,
        metadata
    )
    VALUES (
        connection_record.workspace_id,
        'outreach_message',
        created_message_id,
        'human',
        connection_record.user_id,
        connection_record.member_id,
        'browser_extension_message_submitted',
        jsonb_build_object(
            'platform', platform_text,
            'lead_id', lead_uuid,
            'contact_id', contact_uuid,
            'approval_required', TRUE
        )
    );

    RETURN jsonb_build_object(
        'message_id', created_message_id,
        'action_id', created_action_id,
        'status', 'pending_approval'
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.browser_extension_get_context(check_token_hash text, check_page_url text DEFAULT NULL::text, check_page_title text DEFAULT NULL::text, check_lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    connection_record RECORD;
    page_url_value TEXT := NULLIF(btrim(check_page_url), '');
    page_title_value TEXT := NULLIF(btrim(check_page_title), '');
    page_host_value TEXT;
    selected_lead_id UUID;
    selected_lead JSONB;
    lead_options JSONB;
    message_rows JSONB;
    permission_rows JSONB;
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY[]::TEXT[]
    );

    IF page_url_value IS NOT NULL
       AND (
           char_length(page_url_value) > 2000
           OR page_url_value !~* '^https?://[^[:space:]]+$'
       )
    THEN
        RAISE EXCEPTION 'Active page URL is invalid'
            USING ERRCODE = '22023';
    END IF;
    IF page_title_value IS NOT NULL
       AND char_length(page_title_value) > 500
    THEN
        RAISE EXCEPTION 'Active page title is too long'
            USING ERRCODE = '22023';
    END IF;

    IF page_url_value IS NOT NULL THEN
        page_host_value :=
            public.browser_extension_url_host(page_url_value);
    END IF;

    IF check_lead_id IS NOT NULL THEN
        SELECT lead.id
        INTO selected_lead_id
        FROM public.leads lead
        WHERE lead.id = check_lead_id
          AND lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL;
    ELSE
        SELECT ranked_lead.id
        INTO selected_lead_id
        FROM (
            SELECT
                lead.id,
                CASE
                    WHEN page_host_value IS NOT NULL
                         AND lead.website_url IS NOT NULL
                         AND public.browser_extension_url_host(
                             lead.website_url
                         ) = page_host_value
                    THEN 1
                    WHEN page_url_value IS NOT NULL
                         AND EXISTS (
                             SELECT 1
                             FROM public.lead_contacts contact
                             WHERE contact.lead_id = lead.id
                               AND (
                                   (
                                       contact.linkedin_url IS NOT NULL
                                       AND public.browser_extension_normalize_url(
                                           contact.linkedin_url
                                       ) =
                                           public.browser_extension_normalize_url(
                                               page_url_value
                                           )
                                   )
                                   OR (
                                       contact.instagram_handle IS NOT NULL
                                       AND public.browser_extension_normalize_url(
                                           page_url_value
                                       ) LIKE
                                           'instagram.com/' ||
                                           lower(
                                               trim(
                                                   both '@'
                                                   FROM contact.instagram_handle
                                               )
                                           ) || '%'
                                   )
                               )
                         )
                    THEN 2
                    WHEN page_title_value IS NOT NULL
                         AND char_length(lead.company_name) >= 4
                         AND page_title_value ILIKE
                             '%' || lead.company_name || '%'
                    THEN 3
                    ELSE 4
                END AS match_rank,
                lead.updated_at
            FROM public.leads lead
            WHERE lead.workspace_id = connection_record.workspace_id
              AND lead.deleted_at IS NULL
        ) ranked_lead
        WHERE ranked_lead.match_rank < 4
        ORDER BY ranked_lead.match_rank, ranked_lead.updated_at DESC
        LIMIT 1;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lead_row.id,
                'company_name', lead_row.company_name,
                'website_url', lead_row.website_url,
                'status', lead_row.status,
                'industry', lead_row.industry,
                'location', lead_row.location
            )
            ORDER BY lead_row.company_name
        ),
        '[]'::JSONB
    )
    INTO lead_options
    FROM (
        SELECT
            lead.id,
            lead.company_name,
            lead.website_url,
            lead.status,
            lead.industry,
            lead.location
        FROM public.leads lead
        WHERE lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL
        ORDER BY lead.updated_at DESC
        LIMIT 100
    ) lead_row;

    IF selected_lead_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', lead.id,
            'company_name', lead.company_name,
            'website_url', lead.website_url,
            'status', lead.status,
            'industry', lead.industry,
            'location', lead.location,
            'contacts', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', contact.id,
                            'first_name', contact.first_name,
                            'last_name', contact.last_name,
                            'job_title', contact.job_title,
                            'is_primary', contact.is_primary,
                            'email', contact.email,
                            'phone', contact.phone,
                    'phone_type', contact.phone_type,
                    'whatsapp_number', contact.whatsapp_number,
                    'whatsapp_status', contact.whatsapp_status,
                    'whatsapp_source_url', contact.whatsapp_source_url,
                    'contact_kind', contact.contact_kind,
                    'source_url', contact.source_url,
                            'linkedin_url', contact.linkedin_url,
                            'instagram_handle',
                                contact.instagram_handle
                        )
                        ORDER BY contact.is_primary DESC,
                                 contact.first_name
                    )
                    FROM public.lead_contacts contact
                    WHERE contact.lead_id = lead.id
                ),
                '[]'::JSONB
            )
        )
        INTO selected_lead
        FROM public.leads lead
        WHERE lead.id = selected_lead_id
          AND lead.workspace_id = connection_record.workspace_id
          AND lead.deleted_at IS NULL;

        SELECT COALESCE(
            jsonb_agg(to_jsonb(message_row)
                ORDER BY message_row.updated_at DESC),
            '[]'::JSONB
        )
        INTO message_rows
        FROM (
            SELECT
                message.id,
                message.lead_id,
                message.contact_id,
                message.platform::TEXT,
                message.direction::TEXT,
                message.subject,
                message.content,
                message.status::TEXT,
                message.ai_action_id AS action_id,
                action.status::TEXT AS action_status,
                approval.decision::TEXT AS approval_decision,
                message.sent_at,
                message.created_at,
                message.updated_at,
                contact.first_name,
                contact.last_name,
                contact.email,
                contact.phone, contact.phone_type, contact.whatsapp_number, contact.whatsapp_status, contact.whatsapp_source_url, contact.facebook_url,
                contact.linkedin_url,
                contact.instagram_handle,
                (
                    message.direction = 'outbound'
                    AND message.status = 'pending_approval'
                    AND action.status = 'pending_approval'
                    AND approval.id IS NULL
                ) AS can_approve,
                (
                    message.direction = 'outbound'
                    AND message.status = 'scheduled'
                    AND action.status = 'approved'
                    AND approval.decision = 'approved'
                ) AS can_deliver
            FROM public.outreach_messages message
            LEFT JOIN public.ai_actions action
              ON action.id = message.ai_action_id
             AND action.workspace_id = message.workspace_id
             AND action.deleted_at IS NULL
            LEFT JOIN public.ai_approvals approval
              ON approval.ai_action_id = action.id
             AND approval.workspace_id = message.workspace_id
            LEFT JOIN public.lead_contacts contact
              ON contact.id = message.contact_id
            WHERE message.workspace_id = connection_record.workspace_id
              AND message.lead_id = selected_lead_id
              AND message.deleted_at IS NULL
            ORDER BY message.updated_at DESC
            LIMIT 30
        ) message_row;
    ELSE
        selected_lead := NULL;
        message_rows := '[]'::JSONB;
    END IF;

    SELECT COALESCE(
        jsonb_agg(permission.key ORDER BY permission.key),
        '[]'::JSONB
    )
    INTO permission_rows
    FROM public.workspace_permissions member_permission
    JOIN public.permissions permission
      ON permission.id = member_permission.permission_id
    WHERE member_permission.workspace_member_id =
        connection_record.member_id;

    RETURN jsonb_build_object(
        'workspace', jsonb_build_object(
            'id', connection_record.workspace_id,
            'slug', connection_record.workspace_slug,
            'name', connection_record.workspace_name,
            'is_personal', connection_record.is_personal
        ),
        'connection_id', connection_record.connection_id,
        'permissions', permission_rows,
        'active_page', jsonb_build_object(
            'url', page_url_value,
            'title', page_title_value
        ),
        'matched_automatically',
            check_lead_id IS NULL AND selected_lead_id IS NOT NULL,
        'selected_lead', selected_lead,
        'leads', lead_options,
        'messages', message_rows
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.browser_extension_get_outreach_basis(check_token_hash text, check_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                    'phone_type', contact.phone_type,
                    'whatsapp_number', contact.whatsapp_number,
                    'whatsapp_status', contact.whatsapp_status,
                    'whatsapp_source_url', contact.whatsapp_source_url,
                    'contact_kind', contact.contact_kind,
                    'source_url', contact.source_url,
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
$function$;
CREATE OR REPLACE FUNCTION public.generate_personalized_outreach(check_workspace_id uuid, check_lead_id uuid, outreach_input jsonb)
 RETURNS TABLE(message_id uuid, personalization_action_id uuid, compliance_action_id uuid, compliance_passed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    personalization_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000305'::UUID;
    compliance_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000306'::UUID;
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    lead_record public.leads%ROWTYPE;
    contact_record public.lead_contacts%ROWTYPE;
    report_record public.lead_research_reports%ROWTYPE;
    contact_uuid UUID;
    platform_text TEXT;
    tone_text TEXT;
    goal_text TEXT;
    top_pain_point JSONB;
    opportunity_text TEXT;
    greeting_text TEXT;
    opening_text TEXT;
    call_to_action_text TEXT;
    closing_text TEXT;
    opt_out_text TEXT :=
        'If this is not relevant, just let me know and I will not follow up.';
    generated_subject TEXT;
    generated_content TEXT;
    created_personalization_action_id UUID;
    created_compliance_action_id UUID;
    created_message_id UUID;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_ai'
    )
    OR NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_leads'
    )
    THEN
        RAISE EXCEPTION
            'Personalized outreach requires manage_ai and manage_leads'
            USING ERRCODE = '42501';
    END IF;

    SELECT member.id
    INTO actor_member_id
    FROM public.workspace_members member
    WHERE member.workspace_id = check_workspace_id
      AND member.user_id = actor_user_id
      AND member.deleted_at IS NULL;

    IF actor_member_id IS NULL THEN
        RAISE EXCEPTION 'Active workspace membership required'
            USING ERRCODE = '42501';
    END IF;

    SELECT lead.*
    INTO lead_record
    FROM public.leads lead
    WHERE lead.id = check_lead_id
      AND lead.workspace_id = check_workspace_id
      AND lead.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active lead not found in workspace'
            USING ERRCODE = '22023';
    END IF;

    IF outreach_input IS NULL
       OR jsonb_typeof(outreach_input) <> 'object'
    THEN
        RAISE EXCEPTION 'Outreach input must be a JSON object'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(outreach_input) supplied_key
        WHERE supplied_key NOT IN (
            'contact_id',
            'platform',
            'tone',
            'goal'
        )
    ) THEN
        RAISE EXCEPTION 'Outreach input contains an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(outreach_input -> 'contact_id') <> 'string'
       OR (outreach_input ->> 'contact_id') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    THEN
        RAISE EXCEPTION 'A valid lead contact is required'
            USING ERRCODE = '22023';
    END IF;
    contact_uuid := (outreach_input ->> 'contact_id')::UUID;

    IF jsonb_typeof(outreach_input -> 'platform') <> 'string' THEN
        RAISE EXCEPTION 'Outreach platform must be text'
            USING ERRCODE = '22023';
    END IF;
    platform_text := lower(btrim(outreach_input ->> 'platform'));
    IF platform_text NOT IN (
        'email',
        'linkedin',
        'whatsapp',
        'instagram',
        'facebook',
        'sms'
    ) THEN
        RAISE EXCEPTION
            'Select email, LinkedIn, WhatsApp, Instagram, Facebook, or SMS'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(outreach_input -> 'tone') <> 'string' THEN
        RAISE EXCEPTION 'Outreach tone must be text'
            USING ERRCODE = '22023';
    END IF;
    tone_text := lower(btrim(outreach_input ->> 'tone'));
    IF tone_text NOT IN ('concise', 'consultative', 'warm') THEN
        RAISE EXCEPTION 'Outreach tone is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(outreach_input -> 'goal') <> 'string' THEN
        RAISE EXCEPTION 'Outreach goal must be text'
            USING ERRCODE = '22023';
    END IF;
    goal_text := lower(btrim(outreach_input ->> 'goal'));
    IF goal_text NOT IN ('book_call', 'offer_audit', 'share_idea') THEN
        RAISE EXCEPTION 'Outreach goal is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT contact.*
    INTO contact_record
    FROM public.lead_contacts contact
    WHERE contact.id = contact_uuid
      AND contact.lead_id = check_lead_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact does not belong to this lead'
            USING ERRCODE = '22023';
    END IF;

    IF (platform_text = 'email' AND
        NULLIF(btrim(contact_record.email), '') IS NULL)
       OR (platform_text = 'sms' AND NULLIF(btrim(contact_record.phone), '') IS NULL)
       OR (platform_text = 'whatsapp' AND (contact_record.whatsapp_number IS NULL OR contact_record.whatsapp_status NOT IN ('published','confirmed')))
       OR (platform_text = 'facebook' AND NULLIF(btrim(contact_record.facebook_url), '') IS NULL)
       OR (platform_text = 'linkedin' AND
           NULLIF(btrim(contact_record.linkedin_url), '') IS NULL)
       OR (platform_text = 'instagram' AND
           NULLIF(btrim(contact_record.instagram_handle), '') IS NULL)
    THEN
        RAISE EXCEPTION
            'Selected contact is not reachable on this channel'
            USING ERRCODE = '22023';
    END IF;

    SELECT report.*
    INTO report_record
    FROM public.lead_research_reports report
    WHERE report.workspace_id = check_workspace_id
      AND report.lead_id = check_lead_id
    ORDER BY report.created_at DESC, report.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Run business research before personalized outreach'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(report_record.pain_points) <> 'array'
       OR jsonb_array_length(report_record.pain_points) = 0
    THEN
        RAISE EXCEPTION
            'Research found no evidence-backed service opportunity'
            USING ERRCODE = '22023';
    END IF;

    top_pain_point := report_record.pain_points -> 0;
    opportunity_text := NULLIF(
        btrim(top_pain_point ->> 'service_opportunity'),
        ''
    );
    IF opportunity_text IS NULL THEN
        RAISE EXCEPTION
            'Research service opportunity is incomplete'
            USING ERRCODE = '22023';
    END IF;

    greeting_text := 'Hello ' || contact_record.first_name || ',';
    opening_text := CASE tone_text
        WHEN 'concise' THEN
            'I reviewed ' || lead_record.company_name ||
            '''s public presence and noticed an opportunity around ' ||
            lower(opportunity_text) || '.'
        WHEN 'warm' THEN
            'I hope you are doing well. While reviewing ' ||
            lead_record.company_name ||
            '''s public presence, I noticed an opportunity around ' ||
            lower(opportunity_text) || '.'
        ELSE
            'I was reviewing ' || lead_record.company_name ||
            '''s public presence and identified a potential opportunity around ' ||
            lower(opportunity_text) || '.'
    END;
    call_to_action_text := CASE goal_text
        WHEN 'book_call' THEN
            'Would a short 15-minute conversation next week be useful?'
        WHEN 'offer_audit' THEN
            'I can share a concise audit with a few practical next steps if that would help.'
        ELSE
            'Would it be helpful if I sent over one concrete idea?'
    END;
    closing_text := CASE tone_text
        WHEN 'warm' THEN 'Best wishes,'
        WHEN 'consultative' THEN 'Regards,'
        ELSE 'Thanks,'
    END;

    generated_subject := CASE
        WHEN platform_text = 'email' THEN
            left(
                'Idea for ' || lead_record.company_name || ': ' ||
                opportunity_text,
                300
            )
        ELSE NULL
    END;

    generated_content := concat_ws(
        E'\n\n',
        greeting_text,
        opening_text,
        call_to_action_text,
        opt_out_text,
        closing_text
    );

    IF char_length(generated_content) > 2000 THEN
        RAISE EXCEPTION 'Generated outreach exceeds the safe length limit'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.ai_actions (
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        status,
        priority,
        started_at,
        finished_at,
        payload,
        result_data,
        agent_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        'lead',
        check_lead_id,
        'personalize_outreach',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'lead_id', check_lead_id,
            'contact_id', contact_uuid,
            'research_report_id', report_record.id,
            'platform', platform_text,
            'tone', tone_text,
            'goal', goal_text
        ),
        jsonb_build_object(
            'grounded_in_research', TRUE,
            'research_report_id', report_record.id,
            'pain_point_key', top_pain_point ->> 'key',
            'service_opportunity', opportunity_text,
            'private_fact_claims', FALSE,
            'delivery_performed', FALSE
        ),
        personalization_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_personalization_action_id;

    INSERT INTO public.ai_actions (
        workspace_id,
        entity_type,
        entity_id,
        action_type,
        status,
        priority,
        payload,
        result_data,
        agent_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        'outreach_message',
        NULL,
        'review_outreach_compliance',
        'pending_approval',
        'normal',
        jsonb_build_object(
            'lead_id', check_lead_id,
            'contact_id', contact_uuid,
            'research_report_id', report_record.id,
            'personalization_action_id',
                created_personalization_action_id,
            'platform', platform_text,
            'tone', tone_text,
            'goal', goal_text
        ),
        jsonb_build_object(
            'checks', jsonb_build_array(
                jsonb_build_object(
                    'key', 'grounded_in_research',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'reachable_channel',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'private_fact_claims_absent',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'opt_out_included',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'human_approval_required',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'delivery_not_performed',
                    'passed', TRUE
                )
            ),
            'compliance_passed', TRUE,
            'human_approval_required', TRUE,
            'delivery_performed', FALSE
        ),
        compliance_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_compliance_action_id;

    INSERT INTO public.outreach_messages (
        workspace_id,
        lead_id,
        contact_id,
        platform,
        direction,
        subject,
        content,
        status,
        ai_action_id
    )
    VALUES (
        check_workspace_id,
        check_lead_id,
        contact_uuid,
        platform_text::public.outreach_platform,
        'outbound',
        generated_subject,
        generated_content,
        'pending_approval',
        created_compliance_action_id
    )
    RETURNING id INTO created_message_id;

    INSERT INTO public.message_versions (
        outreach_message_id,
        content,
        edited_by,
        version_number,
        change_reason
    )
    VALUES (
        created_message_id,
        generated_content,
        NULL,
        1,
        'Generated from evidence-backed lead research'
    );

    UPDATE public.ai_actions
    SET
        entity_id = created_message_id,
        result_data = result_data || jsonb_build_object(
            'message_id', created_message_id,
            'message_status', 'pending_approval'
        )
    WHERE id = created_compliance_action_id
      AND workspace_id = check_workspace_id;

    UPDATE public.ai_actions
    SET result_data = result_data || jsonb_build_object(
        'message_id', created_message_id,
        'compliance_action_id', created_compliance_action_id
    )
    WHERE id = created_personalization_action_id
      AND workspace_id = check_workspace_id;

    INSERT INTO public.activities (
        workspace_id,
        entity_type,
        entity_id,
        actor_type,
        actor_user_id,
        workspace_member_id,
        actor_agent_id,
        action,
        metadata
    )
    VALUES (
        check_workspace_id,
        'outreach_message',
        created_message_id,
        'ai_agent',
        NULL,
        actor_member_id,
        compliance_agent_id,
        'personalized_outreach_awaiting_review',
        jsonb_build_object(
            'message_id', created_message_id,
            'lead_id', check_lead_id,
            'contact_id', contact_uuid,
            'platform', platform_text,
            'personalization_action_id',
                created_personalization_action_id,
            'ai_action_id', created_compliance_action_id,
            'delivery_performed', FALSE
        )
    );

    RETURN QUERY
    SELECT
        created_message_id,
        created_personalization_action_id,
        created_compliance_action_id,
        TRUE;
END;
$function$;
