-- ==========================================
-- 025_browser_companion_messaging.sql
-- Secure browser-companion pairing, review, and delivery confirmation.
-- ==========================================

CREATE TABLE public.browser_extension_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL DEFAULT 'Browser companion',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    request_window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT browser_extension_connections_token_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT browser_extension_connections_device_name
        CHECK (char_length(btrim(device_name)) BETWEEN 2 AND 80),
    CONSTRAINT browser_extension_connections_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT browser_extension_connections_request_count
        CHECK (request_count >= 0)
);

CREATE INDEX idx_browser_extension_connections_user
    ON public.browser_extension_connections(user_id, workspace_id);
CREATE INDEX idx_browser_extension_connections_active
    ON public.browser_extension_connections(workspace_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TRIGGER set_updated_at_browser_extension_connections
BEFORE UPDATE ON public.browser_extension_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.browser_extension_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "browser_extension_connections_select_own"
ON public.browser_extension_connections
FOR SELECT
USING (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.workspace_members member
        WHERE member.workspace_id =
            browser_extension_connections.workspace_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
    )
);

CREATE POLICY "browser_extension_connections_insert_own"
ON public.browser_extension_connections
FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND public.has_workspace_permission(
        workspace_id,
        'manage_integrations'
    )
);

CREATE POLICY "browser_extension_connections_update_own"
ON public.browser_extension_connections
FOR UPDATE
USING (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.workspace_members member
        WHERE member.workspace_id =
            browser_extension_connections.workspace_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
    )
)
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.workspace_members member
        WHERE member.workspace_id =
            browser_extension_connections.workspace_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
    )
);

CREATE POLICY "browser_extension_connections_delete_own"
ON public.browser_extension_connections
FOR DELETE
USING (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.workspace_members member
        WHERE member.workspace_id =
            browser_extension_connections.workspace_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
    )
);

REVOKE ALL ON TABLE public.browser_extension_connections FROM PUBLIC;
REVOKE ALL ON TABLE public.browser_extension_connections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.browser_extension_connections TO authenticated;

CREATE OR REPLACE FUNCTION public.browser_extension_normalize_url(
    url_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
    SELECT lower(
        regexp_replace(
            regexp_replace(
                split_part(split_part(btrim(url_value), '?', 1), '#', 1),
                '/+$',
                ''
            ),
            '^https?://(www\.)?',
            '',
            'i'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_url_host(
    url_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
    SELECT regexp_replace(
        split_part(
            public.browser_extension_normalize_url(url_value),
            '/',
            1
        ),
        ':[0-9]+$',
        ''
    );
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_require_connection(
    check_token_hash TEXT,
    required_permission_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
    connection_id UUID,
    workspace_id UUID,
    user_id UUID,
    member_id UUID,
    workspace_slug TEXT,
    workspace_name TEXT,
    is_personal BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    connection_record public.browser_extension_connections%ROWTYPE;
    active_member_id UUID;
    active_workspace public.workspaces%ROWTYPE;
BEGIN
    IF check_token_hash IS NULL
       OR check_token_hash !~ '^[0-9a-f]{64}$'
    THEN
        RAISE EXCEPTION 'Invalid browser companion key'
            USING ERRCODE = '28000';
    END IF;

    SELECT connection.*
    INTO connection_record
    FROM public.browser_extension_connections connection
    WHERE connection.token_hash = check_token_hash
    FOR UPDATE;

    IF NOT FOUND
       OR connection_record.revoked_at IS NOT NULL
       OR connection_record.expires_at <= clock_timestamp()
    THEN
        RAISE EXCEPTION
            'Browser companion connection is invalid, expired, or revoked'
            USING ERRCODE = '28000';
    END IF;

    SELECT workspace.*
    INTO active_workspace
    FROM public.workspaces workspace
    WHERE workspace.id = connection_record.workspace_id
      AND workspace.deleted_at IS NULL;

    SELECT member.id
    INTO active_member_id
    FROM public.workspace_members member
    WHERE member.workspace_id = connection_record.workspace_id
      AND member.user_id = connection_record.user_id
      AND member.deleted_at IS NULL;

    IF active_workspace.id IS NULL OR active_member_id IS NULL THEN
        RAISE EXCEPTION 'Active workspace membership is required'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(
            COALESCE(required_permission_keys, ARRAY[]::TEXT[])
        ) required_permission
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.workspace_permissions member_permission
            JOIN public.permissions permission
              ON permission.id = member_permission.permission_id
            WHERE member_permission.workspace_member_id = active_member_id
              AND permission.key = required_permission
        )
    ) THEN
        RAISE EXCEPTION 'Browser companion permission denied'
            USING ERRCODE = '42501';
    END IF;

    IF connection_record.request_window_started_at
       <= clock_timestamp() - INTERVAL '5 minutes'
    THEN
        UPDATE public.browser_extension_connections
        SET request_window_started_at = clock_timestamp(),
            request_count = 1,
            last_used_at = clock_timestamp()
        WHERE id = connection_record.id;
    ELSIF connection_record.request_count >= 240 THEN
        RAISE EXCEPTION 'Browser companion rate limit exceeded'
            USING ERRCODE = 'P0001';
    ELSE
        UPDATE public.browser_extension_connections
        SET request_count = request_count + 1,
            last_used_at = clock_timestamp()
        WHERE id = connection_record.id;
    END IF;

    RETURN QUERY
    SELECT
        connection_record.id,
        connection_record.workspace_id,
        connection_record.user_id,
        active_member_id,
        active_workspace.slug,
        active_workspace.name,
        active_workspace.is_personal;
END;
$$;

REVOKE ALL ON FUNCTION public.browser_extension_normalize_url(TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.browser_extension_url_host(TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.browser_extension_require_connection(
    TEXT,
    TEXT[]
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.browser_extension_sync_outreach_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.entity_type = 'outreach_message'
       AND NEW.entity_id IS NOT NULL
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved', 'rejected')
    THEN
        UPDATE public.outreach_messages message
        SET status = CASE
                WHEN NEW.status = 'approved'
                THEN 'scheduled'::public.outreach_status
                ELSE 'failed'::public.outreach_status
            END,
            updated_at = clock_timestamp()
        WHERE message.id = NEW.entity_id
          AND message.workspace_id = NEW.workspace_id
          AND message.ai_action_id = NEW.id
          AND message.status = 'pending_approval'
          AND message.deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER sync_browser_extension_outreach_status
AFTER UPDATE OF status ON public.ai_actions
FOR EACH ROW
EXECUTE FUNCTION public.browser_extension_sync_outreach_status();

REVOKE ALL ON FUNCTION public.browser_extension_sync_outreach_status()
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.browser_extension_get_context(
    check_token_hash TEXT,
    check_page_url TEXT DEFAULT NULL,
    check_page_title TEXT DEFAULT NULL,
    check_lead_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
                contact.phone,
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
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_create_draft(
    check_token_hash TEXT,
    draft_input JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
       OR (platform_text IN ('whatsapp', 'sms')
        AND NULLIF(btrim(contact_record.phone), '') IS NULL)
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
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_decide_message(
    check_token_hash TEXT,
    check_message_id UUID,
    decision_value TEXT,
    reason_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    connection_record RECORD;
    message_record public.outreach_messages%ROWTYPE;
    action_record public.ai_actions%ROWTYPE;
    normalized_decision TEXT := lower(NULLIF(btrim(decision_value), ''));
    normalized_reason TEXT := NULLIF(btrim(reason_value), '');
    approval_snapshot JSONB;
    created_approval_id UUID;
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY['manage_ai']::TEXT[]
    );

    IF check_message_id IS NULL
       OR normalized_decision NOT IN ('approved', 'rejected')
    THEN
        RAISE EXCEPTION 'A valid message decision is required'
            USING ERRCODE = '22023';
    END IF;
    IF normalized_decision = 'rejected'
       AND (
           normalized_reason IS NULL
           OR char_length(normalized_reason) NOT BETWEEN 3 AND 1000
       )
    THEN
        RAISE EXCEPTION
            'Rejection reason must be between 3 and 1000 characters'
            USING ERRCODE = '22023';
    END IF;

    SELECT message.*
    INTO message_record
    FROM public.outreach_messages message
    WHERE message.id = check_message_id
      AND message.workspace_id = connection_record.workspace_id
      AND message.status = 'pending_approval'
      AND message.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND OR message_record.ai_action_id IS NULL THEN
        RAISE EXCEPTION
            'Message was already reviewed or is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT action.*
    INTO action_record
    FROM public.ai_actions action
    WHERE action.id = message_record.ai_action_id
      AND action.workspace_id = connection_record.workspace_id
      AND action.entity_type = 'outreach_message'
      AND action.entity_id = message_record.id
      AND action.status = 'pending_approval'
      AND action.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Message was already reviewed or is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT jsonb_build_object(
        'message_id', message_record.id,
        'subject', message_record.subject,
        'content', message_record.content,
        'platform', message_record.platform,
        'status', message_record.status,
        'version_number', COALESCE(
            (
                SELECT max(version.version_number)
                FROM public.message_versions version
                WHERE version.outreach_message_id = message_record.id
            ),
            0
        )
    )
    INTO approval_snapshot;

    INSERT INTO public.ai_approvals (
        ai_action_id,
        workspace_id,
        approver_id,
        decision,
        reason,
        approved_payload,
        decided_at
    )
    VALUES (
        action_record.id,
        connection_record.workspace_id,
        connection_record.user_id,
        normalized_decision::public.ai_approval_decision,
        CASE
            WHEN normalized_decision = 'rejected'
            THEN normalized_reason
            ELSE NULL
        END,
        CASE
            WHEN normalized_decision = 'approved'
            THEN approval_snapshot
            ELSE NULL
        END,
        clock_timestamp()
    )
    RETURNING id INTO created_approval_id;

    UPDATE public.ai_actions
    SET status = normalized_decision::public.ai_action_status
    WHERE id = action_record.id
      AND workspace_id = connection_record.workspace_id;

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
        message_record.id,
        'human',
        connection_record.user_id,
        connection_record.member_id,
        CASE
            WHEN normalized_decision = 'approved'
            THEN 'approval_granted'
            ELSE 'approval_rejected'
        END,
        jsonb_build_object(
            'decision', normalized_decision,
            'source', 'browser_extension',
            'ai_action_id', action_record.id
        )
    );

    RETURN jsonb_build_object(
        'approval_id', created_approval_id,
        'message_id', message_record.id,
        'action_id', action_record.id,
        'decision', normalized_decision,
        'status', CASE
            WHEN normalized_decision = 'approved'
            THEN 'scheduled'
            ELSE 'failed'
        END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.browser_extension_mark_sent(
    check_token_hash TEXT,
    check_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    connection_record RECORD;
    message_record public.outreach_messages%ROWTYPE;
    sent_time TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT *
    INTO connection_record
    FROM public.browser_extension_require_connection(
        check_token_hash,
        ARRAY['manage_leads']::TEXT[]
    );

    SELECT message.*
    INTO message_record
    FROM public.outreach_messages message
    JOIN public.ai_actions action
      ON action.id = message.ai_action_id
     AND action.workspace_id = message.workspace_id
     AND action.status = 'approved'
     AND action.deleted_at IS NULL
    JOIN public.ai_approvals approval
      ON approval.ai_action_id = action.id
     AND approval.workspace_id = message.workspace_id
     AND approval.decision = 'approved'
    WHERE message.id = check_message_id
      AND message.workspace_id = connection_record.workspace_id
      AND message.direction = 'outbound'
      AND message.status = 'scheduled'
      AND message.deleted_at IS NULL
    FOR UPDATE OF message;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Only an approved, ready message can be marked sent'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.outreach_messages existing
        WHERE existing.id <> message_record.id
          AND existing.workspace_id = message_record.workspace_id
          AND existing.lead_id = message_record.lead_id
          AND existing.contact_id IS NOT DISTINCT
              FROM message_record.contact_id
          AND existing.platform = message_record.platform
          AND lower(btrim(existing.content)) =
              lower(btrim(message_record.content))
          AND existing.status IN ('sent', 'delivered', 'replied')
          AND existing.sent_at >= sent_time - INTERVAL '7 days'
          AND existing.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'An identical message was already sent to this contact recently'
            USING ERRCODE = '23505';
    END IF;

    UPDATE public.outreach_messages
    SET status = 'sent',
        sent_at = sent_time,
        updated_at = sent_time
    WHERE id = message_record.id
      AND workspace_id = connection_record.workspace_id;

    UPDATE public.leads
    SET status = 'contacted',
        updated_at = sent_time
    WHERE id = message_record.lead_id
      AND workspace_id = connection_record.workspace_id
      AND status IN ('new', 'analyzed')
      AND deleted_at IS NULL;

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
        message_record.id,
        'human',
        connection_record.user_id,
        connection_record.member_id,
        'message_sent_confirmed',
        jsonb_build_object(
            'platform', message_record.platform,
            'lead_id', message_record.lead_id,
            'contact_id', message_record.contact_id,
            'source', 'browser_extension',
            'sent_at', sent_time
        )
    );

    RETURN jsonb_build_object(
        'message_id', message_record.id,
        'status', 'sent',
        'sent_at', sent_time
    );
END;
$$;

REVOKE ALL ON FUNCTION public.browser_extension_get_context(
    TEXT,
    TEXT,
    TEXT,
    UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.browser_extension_create_draft(
    TEXT,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.browser_extension_decide_message(
    TEXT,
    UUID,
    TEXT,
    TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.browser_extension_mark_sent(
    TEXT,
    UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.browser_extension_get_context(
    TEXT,
    TEXT,
    TEXT,
    UUID
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.browser_extension_create_draft(
    TEXT,
    JSONB
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.browser_extension_decide_message(
    TEXT,
    UUID,
    TEXT,
    TEXT
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.browser_extension_mark_sent(
    TEXT,
    UUID
) TO anon, authenticated;
