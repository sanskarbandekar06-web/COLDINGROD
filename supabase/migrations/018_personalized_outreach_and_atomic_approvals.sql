-- ==========================================
-- 018_personalized_outreach_and_atomic_approvals.sql
-- Phase 3.4: grounded personalization, compliance, and atomic review
-- ==========================================

INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    system_prompt,
    model
)
VALUES
    (
        '00000000-0000-4000-8000-000000000305',
        NULL,
        'Personalization Agent',
        'Creates concise outreach from stored lead research and a selected service opportunity.',
        'Use only stored lead, contact, qualification, and research evidence. Never invent familiarity, results, private facts, or delivery. Produce a deterministic draft for human review.',
        'coldingrod-rules-v1'
    ),
    (
        '00000000-0000-4000-8000-000000000306',
        NULL,
        'Outreach Compliance Agent',
        'Checks generated outreach for evidence grounding, reachable channels, opt-out language, and required human approval.',
        'Block unsupported channels and ungrounded claims. Never send a message. Every generated draft must remain pending until an authorized human records a decision.',
        'coldingrod-rules-v1'
    )
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    deleted_at = NULL,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.generate_personalized_outreach(
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
    personalization_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000305';
    compliance_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000306';
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
    created_activity_id UUID;
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
        'sms'
    ) THEN
        RAISE EXCEPTION
            'Select email, LinkedIn, WhatsApp, Instagram, or SMS'
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
       OR (platform_text IN ('sms', 'whatsapp') AND
           NULLIF(btrim(contact_record.phone), '') IS NULL)
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
    )
    RETURNING id INTO created_activity_id;

    RETURN QUERY
    SELECT
        created_message_id,
        created_personalization_action_id,
        created_compliance_action_id,
        TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_personalized_outreach(
    UUID,
    UUID,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_personalized_outreach(
    UUID,
    UUID,
    JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_personalized_outreach(
    UUID,
    UUID,
    JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_ai_action(
    check_workspace_id UUID,
    check_action_id UUID,
    decision_value TEXT,
    reason_value TEXT DEFAULT NULL
)
RETURNS TABLE (
    approval_id UUID,
    recorded_decision public.ai_approval_decision,
    entity_type TEXT,
    entity_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    locked_action public.ai_actions%ROWTYPE;
    normalized_decision TEXT := lower(btrim(decision_value));
    normalized_reason TEXT := NULLIF(btrim(reason_value), '');
    approval_snapshot JSONB;
    created_approval_id UUID;
BEGIN
    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_workspace_permission(
        check_workspace_id,
        'manage_ai'
    ) THEN
        RAISE EXCEPTION 'AI review requires manage_ai'
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

    IF normalized_decision IS NULL
       OR normalized_decision NOT IN ('approved', 'rejected')
    THEN
        RAISE EXCEPTION 'Decision must be approved or rejected'
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

    IF normalized_decision = 'approved'
       AND normalized_reason IS NOT NULL
       AND char_length(normalized_reason) > 1000
    THEN
        RAISE EXCEPTION 'Approval note must be 1000 characters or fewer'
            USING ERRCODE = '22023';
    END IF;

    SELECT action.*
    INTO locked_action
    FROM public.ai_actions action
    WHERE action.id = check_action_id
      AND action.workspace_id = check_workspace_id
      AND action.status = 'pending_approval'
      AND action.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Action was already reviewed or is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    approval_snapshot := locked_action.payload;
    IF normalized_decision = 'approved'
       AND locked_action.entity_type = 'outreach_message'
       AND locked_action.entity_id IS NOT NULL
    THEN
        SELECT jsonb_build_object(
            'message_id', message.id,
            'subject', message.subject,
            'content', message.content,
            'platform', message.platform,
            'status', message.status,
            'version_number', COALESCE(
                (
                    SELECT max(version.version_number)
                    FROM public.message_versions version
                    WHERE version.outreach_message_id = message.id
                ),
                0
            )
        )
        INTO approval_snapshot
        FROM public.outreach_messages message
        WHERE message.id = locked_action.entity_id
          AND message.workspace_id = check_workspace_id
          AND message.ai_action_id = locked_action.id
          AND message.deleted_at IS NULL;

        IF approval_snapshot IS NULL THEN
            RAISE EXCEPTION
                'Linked outreach message is unavailable'
                USING ERRCODE = '22023';
        END IF;
    END IF;

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
        locked_action.id,
        check_workspace_id,
        actor_user_id,
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
    SET status =
        normalized_decision::public.ai_action_status
    WHERE id = locked_action.id
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
        'ai_action',
        locked_action.id,
        'human',
        actor_user_id,
        actor_member_id,
        NULL,
        CASE
            WHEN normalized_decision = 'approved'
            THEN 'approval_granted'
            ELSE 'approval_rejected'
        END,
        jsonb_build_object(
            'decision', normalized_decision,
            'entity_type', locked_action.entity_type,
            'entity_id', locked_action.entity_id
        )
    );

    RETURN QUERY
    SELECT
        created_approval_id,
        normalized_decision::public.ai_approval_decision,
        locked_action.entity_type,
        locked_action.entity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_ai_action(
    UUID,
    UUID,
    TEXT,
    TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_ai_action(
    UUID,
    UUID,
    TEXT,
    TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.decide_ai_action(
    UUID,
    UUID,
    TEXT,
    TEXT
) TO authenticated;
