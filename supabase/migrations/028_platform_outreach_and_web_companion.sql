-- Platform-native outreach drafts and authenticated web-companion delivery.

CREATE OR REPLACE FUNCTION public.generate_personalized_outreach_v2(
    check_workspace_id UUID,
    check_lead_id UUID,
    outreach_input JSONB
)
RETURNS TABLE (
    message_id UUID,
    personalization_action_id UUID,
    compliance_action_id UUID,
    compliance_passed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    generated_record RECORD;
    platform_text TEXT;
    subject_text TEXT;
    content_text TEXT;
    generator_text TEXT;
    platform_limit INTEGER;
BEGIN
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
            'goal',
            'subject',
            'content',
            'generator'
        )
    ) THEN
        RAISE EXCEPTION 'Outreach input contains an unsupported field'
            USING ERRCODE = '22023';
    END IF;

    platform_text := lower(btrim(outreach_input ->> 'platform'));
    IF platform_text NOT IN (
        'email',
        'linkedin',
        'whatsapp',
        'instagram',
        'sms'
    ) THEN
        RAISE EXCEPTION 'Unsupported outreach platform'
            USING ERRCODE = '22023';
    END IF;

    content_text := NULLIF(btrim(outreach_input ->> 'content'), '');
    subject_text := NULLIF(btrim(outreach_input ->> 'subject'), '');
    generator_text := NULLIF(btrim(outreach_input ->> 'generator'), '');
    platform_limit := CASE platform_text
        WHEN 'email' THEN 1800
        WHEN 'linkedin' THEN 700
        WHEN 'whatsapp' THEN 500
        WHEN 'instagram' THEN 500
        WHEN 'sms' THEN 320
        ELSE 700
    END;

    IF content_text IS NULL
       OR char_length(content_text) > platform_limit
    THEN
        RAISE EXCEPTION
            'Generated content is empty or exceeds the channel limit'
            USING ERRCODE = '22023';
    END IF;
    IF platform_text = 'email'
       AND (subject_text IS NULL OR char_length(subject_text) > 300)
    THEN
        RAISE EXCEPTION 'Email subject is required and must be concise'
            USING ERRCODE = '22023';
    END IF;
    IF platform_text <> 'email' AND subject_text IS NOT NULL THEN
        RAISE EXCEPTION 'Only email outreach may include a subject'
            USING ERRCODE = '22023';
    END IF;
    IF generator_text IS NULL OR char_length(generator_text) > 120 THEN
        RAISE EXCEPTION 'Outreach generator metadata is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF platform_text = 'sms' THEN
        IF content_text !~* '(^|[[:space:]])STOP([[:space:].,;:!?]|$)' THEN
            RAISE EXCEPTION 'SMS outreach must include STOP opt-out wording'
                USING ERRCODE = '22023';
        END IF;
    ELSIF content_text !~* '(not relevant|not a fit|will not follow up|won''t follow up)' THEN
        RAISE EXCEPTION 'Outreach must include clear opt-out wording'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO generated_record
    FROM public.generate_personalized_outreach(
        check_workspace_id,
        check_lead_id,
        jsonb_build_object(
            'contact_id', outreach_input ->> 'contact_id',
            'platform', platform_text,
            'tone', outreach_input ->> 'tone',
            'goal', outreach_input ->> 'goal'
        )
    );

    UPDATE public.outreach_messages
    SET subject = subject_text,
        content = content_text,
        updated_at = clock_timestamp()
    WHERE id = generated_record.message_id
      AND workspace_id = check_workspace_id;

    UPDATE public.message_versions
    SET content = content_text,
        change_reason =
            'Generated for ' || platform_text ||
            ' from evidence-backed lead research'
    WHERE outreach_message_id = generated_record.message_id
      AND version_number = 1;

    UPDATE public.ai_actions
    SET payload = payload || jsonb_build_object(
            'generator', generator_text,
            'channel_style', platform_text
        ),
        result_data = result_data || jsonb_build_object(
            'generator', generator_text,
            'platform_native_copy', TRUE
        )
    WHERE id IN (
        generated_record.personalization_action_id,
        generated_record.compliance_action_id
    )
      AND workspace_id = check_workspace_id;

    RETURN QUERY
    SELECT
        generated_record.message_id::UUID,
        generated_record.personalization_action_id::UUID,
        generated_record.compliance_action_id::UUID,
        TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_personalized_outreach_v2(
    UUID,
    UUID,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_personalized_outreach_v2(
    UUID,
    UUID,
    JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_personalized_outreach_v2(
    UUID,
    UUID,
    JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_outreach_sent(
    check_workspace_id UUID,
    check_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    message_record public.outreach_messages%ROWTYPE;
    sent_time TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_leads'
    ) THEN
        RAISE EXCEPTION 'Lead management permission required'
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
      AND message.workspace_id = check_workspace_id
      AND message.direction = 'outbound'
      AND message.status = 'scheduled'
      AND message.deleted_at IS NULL
    FOR UPDATE OF message;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Only an approved, ready message can be confirmed sent'
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
      AND workspace_id = check_workspace_id;

    UPDATE public.leads
    SET status = 'contacted',
        updated_at = sent_time
    WHERE id = message_record.lead_id
      AND workspace_id = check_workspace_id
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
        check_workspace_id,
        'outreach_message',
        message_record.id,
        'human',
        actor_user_id,
        actor_member_id,
        'message_sent_confirmed',
        jsonb_build_object(
            'platform', message_record.platform,
            'lead_id', message_record.lead_id,
            'contact_id', message_record.contact_id,
            'source', 'coldingrod_web_companion',
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

REVOKE ALL ON FUNCTION public.confirm_outreach_sent(UUID, UUID)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_outreach_sent(UUID, UUID)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_outreach_sent(UUID, UUID)
    TO authenticated;

