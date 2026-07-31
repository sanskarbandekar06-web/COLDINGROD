-- ==========================================
-- 019_follow_up_automation.sql
-- Phase 3.5: response-aware follow-up sequences and review drafts
-- ==========================================

INSERT INTO public.ai_agents (
    id,
    workspace_id,
    name,
    description,
    system_prompt,
    model
)
VALUES (
    '00000000-0000-4000-8000-000000000307',
    NULL,
    'Follow-Up Agent',
    'Plans response-aware follow-up timing and prepares grounded follow-up drafts after verified delivery.',
    'Create follow-ups only after a verified sent message. Stop when the lead responds or reaches a terminal pipeline state. Never send automatically; every prepared draft requires compliance review and human approval.',
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

CREATE TABLE public.follow_up_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL
        REFERENCES public.lead_contacts(id) ON DELETE RESTRICT,
    original_message_id UUID NOT NULL
        REFERENCES public.outreach_messages(id) ON DELETE RESTRICT,
    planning_action_id UUID NOT NULL
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active',
    cadence_days JSONB NOT NULL,
    stop_on_response BOOLEAN NOT NULL DEFAULT TRUE,
    stopped_reason TEXT,
    created_by UUID NOT NULL
        REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT follow_up_sequence_original_unique
        UNIQUE (original_message_id),
    CONSTRAINT follow_up_sequence_status_check
        CHECK (
            status IN ('active', 'paused', 'completed', 'cancelled')
        ),
    CONSTRAINT follow_up_sequence_cadence_array
        CHECK (
            jsonb_typeof(cadence_days) = 'array'
            AND jsonb_array_length(cadence_days) BETWEEN 1 AND 3
        ),
    CONSTRAINT follow_up_sequence_completion_state
        CHECK (
            (
                status IN ('active', 'paused')
                AND completed_at IS NULL
            )
            OR (
                status IN ('completed', 'cancelled')
                AND completed_at IS NOT NULL
            )
        )
);

CREATE TABLE public.follow_up_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL
        REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    message_id UUID
        REFERENCES public.outreach_messages(id) ON DELETE RESTRICT,
    generation_action_id UUID
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    compliance_action_id UUID
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    prepared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT follow_up_step_sequence_number_unique
        UNIQUE (sequence_id, step_number),
    CONSTRAINT follow_up_step_number_check
        CHECK (step_number BETWEEN 1 AND 3),
    CONSTRAINT follow_up_step_status_check
        CHECK (status IN ('planned', 'draft_ready', 'cancelled')),
    CONSTRAINT follow_up_step_draft_state_check
        CHECK (
            (
                status = 'planned'
                AND message_id IS NULL
                AND generation_action_id IS NULL
                AND compliance_action_id IS NULL
                AND prepared_at IS NULL
            )
            OR (
                status = 'draft_ready'
                AND message_id IS NOT NULL
                AND generation_action_id IS NOT NULL
                AND compliance_action_id IS NOT NULL
                AND prepared_at IS NOT NULL
            )
            OR status = 'cancelled'
        )
);

CREATE INDEX idx_follow_up_sequences_workspace_status
    ON public.follow_up_sequences(workspace_id, status, created_at DESC);
CREATE INDEX idx_follow_up_sequences_lead
    ON public.follow_up_sequences(lead_id, created_at DESC);
CREATE INDEX idx_follow_up_steps_due
    ON public.follow_up_steps(workspace_id, status, due_at);
CREATE INDEX idx_follow_up_steps_sequence
    ON public.follow_up_steps(sequence_id, step_number);

CREATE TRIGGER set_updated_at_follow_up_sequences
BEFORE UPDATE ON public.follow_up_sequences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_up_sequences_select"
ON public.follow_up_sequences
FOR SELECT
USING (
    public.is_active_workspace_member(workspace_id)
    AND EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = follow_up_sequences.lead_id
          AND lead.workspace_id = follow_up_sequences.workspace_id
          AND lead.deleted_at IS NULL
    )
);

CREATE POLICY "follow_up_steps_select"
ON public.follow_up_steps
FOR SELECT
USING (
    public.is_active_workspace_member(workspace_id)
    AND EXISTS (
        SELECT 1
        FROM public.follow_up_sequences sequence
        WHERE sequence.id = follow_up_steps.sequence_id
          AND sequence.workspace_id = follow_up_steps.workspace_id
    )
);

REVOKE ALL PRIVILEGES ON TABLE public.follow_up_sequences FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.follow_up_sequences
    FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.follow_up_steps FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.follow_up_steps
    FROM authenticated;
GRANT SELECT ON TABLE public.follow_up_sequences TO authenticated;
GRANT SELECT ON TABLE public.follow_up_steps TO authenticated;

CREATE OR REPLACE FUNCTION public.create_follow_up_sequence(
    check_workspace_id UUID,
    check_message_id UUID,
    sequence_input JSONB
)
RETURNS TABLE (
    sequence_id UUID,
    planning_action_id UUID,
    step_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    follow_up_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000307';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    original_message public.outreach_messages%ROWTYPE;
    cadence_value JSONB;
    cadence_day INTEGER;
    previous_day INTEGER := 0;
    normalized_cadence JSONB;
    created_action_id UUID;
    created_sequence_id UUID;
    created_step_count INTEGER;
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
            'Follow-up automation requires manage_ai and manage_leads'
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
    INTO original_message
    FROM public.outreach_messages message
    WHERE message.id = check_message_id
      AND message.workspace_id = check_workspace_id
      AND message.direction = 'outbound'
      AND message.status IN ('sent', 'delivered')
      AND message.sent_at IS NOT NULL
      AND message.contact_id IS NOT NULL
      AND message.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Follow-up requires a verified sent outbound message'
            USING ERRCODE = '22023';
    END IF;

    IF original_message.ai_action_id IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.ai_actions action
           JOIN public.ai_approvals approval
             ON approval.ai_action_id = action.id
            AND approval.workspace_id = action.workspace_id
           WHERE action.id = original_message.ai_action_id
             AND action.workspace_id = check_workspace_id
             AND action.status = 'approved'
             AND action.deleted_at IS NULL
             AND approval.decision = 'approved'
       )
    THEN
        RAISE EXCEPTION
            'Follow-up requires an approved AI outreach message'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.leads lead
        WHERE lead.id = original_message.lead_id
          AND lead.workspace_id = check_workspace_id
          AND (
              lead.deleted_at IS NOT NULL
              OR lead.status IN (
                  'responded',
                  'meeting_scheduled',
                  'won',
                  'lost'
              )
          )
    )
    OR EXISTS (
        SELECT 1
        FROM public.outreach_messages response
        WHERE response.workspace_id = check_workspace_id
          AND response.lead_id = original_message.lead_id
          AND response.contact_id = original_message.contact_id
          AND response.direction = 'inbound'
          AND response.created_at >= original_message.sent_at
          AND response.deleted_at IS NULL
    )
    THEN
        RAISE EXCEPTION
            'Lead has already responded or reached a terminal pipeline state'
            USING ERRCODE = '22023';
    END IF;

    IF sequence_input IS NULL
       OR jsonb_typeof(sequence_input) <> 'object'
       OR EXISTS (
           SELECT 1
           FROM jsonb_object_keys(sequence_input) supplied_key
           WHERE supplied_key <> 'cadence_days'
       )
       OR jsonb_typeof(sequence_input -> 'cadence_days') <> 'array'
       OR jsonb_array_length(
           sequence_input -> 'cadence_days'
       ) NOT BETWEEN 1 AND 3
    THEN
        RAISE EXCEPTION
            'Follow-up cadence must contain one to three days'
            USING ERRCODE = '22023';
    END IF;

    normalized_cadence := sequence_input -> 'cadence_days';
    FOR cadence_value IN
        SELECT value
        FROM jsonb_array_elements(normalized_cadence)
    LOOP
        IF jsonb_typeof(cadence_value) <> 'number'
           OR (cadence_value #>> '{}') !~ '^[0-9]+$'
        THEN
            RAISE EXCEPTION
                'Every follow-up day must be a whole number'
                USING ERRCODE = '22023';
        END IF;
        cadence_day := (cadence_value #>> '{}')::INTEGER;
        IF cadence_day NOT BETWEEN 1 AND 30
           OR cadence_day <= previous_day
        THEN
            RAISE EXCEPTION
                'Follow-up days must increase and stay between 1 and 30'
                USING ERRCODE = '22023';
        END IF;
        previous_day := cadence_day;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.follow_up_sequences sequence
        WHERE sequence.original_message_id = check_message_id
    ) THEN
        RAISE EXCEPTION
            'A follow-up sequence already exists for this message'
            USING ERRCODE = '23505';
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
        'follow_up_sequence',
        NULL,
        'plan_follow_up_sequence',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'original_message_id', check_message_id,
            'lead_id', original_message.lead_id,
            'contact_id', original_message.contact_id,
            'cadence_days', normalized_cadence
        ),
        jsonb_build_object(
            'stop_on_response', TRUE,
            'delivery_performed', FALSE,
            'step_count', jsonb_array_length(normalized_cadence)
        ),
        follow_up_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_action_id;

    INSERT INTO public.follow_up_sequences (
        workspace_id,
        lead_id,
        contact_id,
        original_message_id,
        planning_action_id,
        status,
        cadence_days,
        stop_on_response,
        created_by
    )
    VALUES (
        check_workspace_id,
        original_message.lead_id,
        original_message.contact_id,
        check_message_id,
        created_action_id,
        'active',
        normalized_cadence,
        TRUE,
        actor_user_id
    )
    RETURNING id INTO created_sequence_id;

    INSERT INTO public.follow_up_steps (
        workspace_id,
        sequence_id,
        step_number,
        due_at
    )
    SELECT
        check_workspace_id,
        created_sequence_id,
        item.ordinality::INTEGER,
        original_message.sent_at +
            ((item.value #>> '{}')::INTEGER * INTERVAL '1 day')
    FROM jsonb_array_elements(normalized_cadence)
        WITH ORDINALITY AS item(value, ordinality);
    GET DIAGNOSTICS created_step_count = ROW_COUNT;

    UPDATE public.ai_actions
    SET
        entity_id = created_sequence_id,
        result_data = result_data || jsonb_build_object(
            'sequence_id', created_sequence_id
        )
    WHERE id = created_action_id
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
        'follow_up_sequence',
        created_sequence_id,
        'ai_agent',
        NULL,
        actor_member_id,
        follow_up_agent_id,
        'follow_up_sequence_planned',
        jsonb_build_object(
            'sequence_id', created_sequence_id,
            'original_message_id', check_message_id,
            'lead_id', original_message.lead_id,
            'step_count', created_step_count,
            'delivery_performed', FALSE
        )
    );

    RETURN QUERY
    SELECT
        created_sequence_id,
        created_action_id,
        created_step_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_follow_up_sequence(
    UUID,
    UUID,
    JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_follow_up_sequence(
    UUID,
    UUID,
    JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_follow_up_sequence(
    UUID,
    UUID,
    JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_due_follow_up(
    check_workspace_id UUID,
    check_sequence_id UUID
)
RETURNS TABLE (
    outcome TEXT,
    sequence_status TEXT,
    step_id UUID,
    message_id UUID,
    compliance_action_id UUID,
    due_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    follow_up_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000307';
    compliance_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000306';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    locked_sequence public.follow_up_sequences%ROWTYPE;
    next_step public.follow_up_steps%ROWTYPE;
    original_message public.outreach_messages%ROWTYPE;
    lead_record public.leads%ROWTYPE;
    contact_record public.lead_contacts%ROWTYPE;
    report_record public.lead_research_reports%ROWTYPE;
    top_pain_point JSONB;
    opportunity_text TEXT;
    generated_subject TEXT;
    generated_content TEXT;
    response_detected BOOLEAN := FALSE;
    terminal_lead BOOLEAN := FALSE;
    previous_waiting BOOLEAN := FALSE;
    created_generation_action_id UUID;
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
            'Follow-up preparation requires manage_ai and manage_leads'
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

    SELECT sequence.*
    INTO locked_sequence
    FROM public.follow_up_sequences sequence
    WHERE sequence.id = check_sequence_id
      AND sequence.workspace_id = check_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Follow-up sequence not found'
            USING ERRCODE = '22023';
    END IF;

    IF locked_sequence.status = 'paused' THEN
        RETURN QUERY
        SELECT
            'paused'::TEXT,
            locked_sequence.status,
            NULL::UUID,
            NULL::UUID,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    IF locked_sequence.status IN ('completed', 'cancelled') THEN
        RETURN QUERY
        SELECT
            locked_sequence.status,
            locked_sequence.status,
            NULL::UUID,
            NULL::UUID,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT message.*
    INTO original_message
    FROM public.outreach_messages message
    WHERE message.id = locked_sequence.original_message_id
      AND message.workspace_id = check_workspace_id;

    SELECT lead.*
    INTO lead_record
    FROM public.leads lead
    WHERE lead.id = locked_sequence.lead_id
      AND lead.workspace_id = check_workspace_id;

    terminal_lead :=
        original_message.id IS NULL
        OR original_message.deleted_at IS NOT NULL
        OR lead_record.id IS NULL
        OR lead_record.deleted_at IS NOT NULL
        OR lead_record.status IN (
            'responded',
            'meeting_scheduled',
            'won',
            'lost'
        );
    response_detected :=
        original_message.status = 'replied'
        OR EXISTS (
            SELECT 1
            FROM public.outreach_messages response
            WHERE response.workspace_id = check_workspace_id
              AND response.lead_id = locked_sequence.lead_id
              AND response.contact_id = locked_sequence.contact_id
              AND response.direction = 'inbound'
              AND response.created_at >= original_message.sent_at
              AND response.deleted_at IS NULL
        )
        OR EXISTS (
            SELECT 1
            FROM public.follow_up_steps prepared_step
            JOIN public.outreach_messages prepared_message
              ON prepared_message.id = prepared_step.message_id
            WHERE prepared_step.sequence_id = locked_sequence.id
              AND prepared_message.status = 'replied'
              AND prepared_message.deleted_at IS NULL
        );

    IF response_detected OR terminal_lead THEN
        UPDATE public.follow_up_sequences
        SET
            status = 'completed',
            stopped_reason = CASE
                WHEN response_detected THEN 'response_detected'
                ELSE 'lead_pipeline_terminal'
            END,
            completed_at = clock_timestamp()
        WHERE id = locked_sequence.id
          AND workspace_id = check_workspace_id;

        UPDATE public.follow_up_steps
        SET status = 'cancelled'
        WHERE sequence_id = locked_sequence.id
          AND workspace_id = check_workspace_id
          AND status = 'planned';

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
            'follow_up_sequence',
            locked_sequence.id,
            'ai_agent',
            NULL,
            actor_member_id,
            follow_up_agent_id,
            'follow_up_sequence_stopped',
            jsonb_build_object(
                'sequence_id', locked_sequence.id,
                'reason', CASE
                    WHEN response_detected THEN 'response_detected'
                    ELSE 'lead_pipeline_terminal'
                END,
                'delivery_performed', FALSE
            )
        );

        RETURN QUERY
        SELECT
            'stopped'::TEXT,
            'completed'::TEXT,
            NULL::UUID,
            NULL::UUID,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT step.*
    INTO next_step
    FROM public.follow_up_steps step
    WHERE step.sequence_id = locked_sequence.id
      AND step.workspace_id = check_workspace_id
      AND step.status = 'planned'
    ORDER BY step.step_number
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.follow_up_sequences
        SET
            status = 'completed',
            stopped_reason = 'cadence_exhausted',
            completed_at = clock_timestamp()
        WHERE id = locked_sequence.id
          AND workspace_id = check_workspace_id;

        RETURN QUERY
        SELECT
            'completed'::TEXT,
            'completed'::TEXT,
            NULL::UUID,
            NULL::UUID,
            NULL::UUID,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.follow_up_steps prior_step
        JOIN public.outreach_messages prior_message
          ON prior_message.id = prior_step.message_id
        WHERE prior_step.sequence_id = locked_sequence.id
          AND prior_step.step_number < next_step.step_number
          AND prior_step.status = 'draft_ready'
          AND (
              prior_message.deleted_at IS NOT NULL
              OR prior_message.status NOT IN (
                  'sent',
                  'delivered',
                  'replied'
              )
          )
    )
    INTO previous_waiting;

    IF previous_waiting THEN
        RETURN QUERY
        SELECT
            'waiting_for_previous_delivery'::TEXT,
            locked_sequence.status,
            next_step.id,
            NULL::UUID,
            NULL::UUID,
            next_step.due_at;
        RETURN;
    END IF;

    IF next_step.due_at > NOW() THEN
        RETURN QUERY
        SELECT
            'not_due'::TEXT,
            locked_sequence.status,
            next_step.id,
            NULL::UUID,
            NULL::UUID,
            next_step.due_at;
        RETURN;
    END IF;

    SELECT contact.*
    INTO contact_record
    FROM public.lead_contacts contact
    WHERE contact.id = locked_sequence.contact_id
      AND contact.lead_id = locked_sequence.lead_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Follow-up contact is unavailable'
            USING ERRCODE = '22023';
    END IF;

    IF (original_message.platform = 'email' AND
        NULLIF(btrim(contact_record.email), '') IS NULL)
       OR (original_message.platform IN ('sms', 'whatsapp') AND
           NULLIF(btrim(contact_record.phone), '') IS NULL)
       OR (original_message.platform = 'linkedin' AND
           NULLIF(btrim(contact_record.linkedin_url), '') IS NULL)
       OR (original_message.platform = 'instagram' AND
           NULLIF(btrim(contact_record.instagram_handle), '') IS NULL)
    THEN
        RAISE EXCEPTION
            'Follow-up contact is no longer reachable on this channel'
            USING ERRCODE = '22023';
    END IF;

    SELECT report.*
    INTO report_record
    FROM public.lead_research_reports report
    WHERE report.workspace_id = check_workspace_id
      AND report.lead_id = locked_sequence.lead_id
    ORDER BY report.created_at DESC, report.id DESC
    LIMIT 1;

    IF NOT FOUND
       OR jsonb_array_length(report_record.pain_points) = 0
    THEN
        RAISE EXCEPTION
            'Follow-up requires evidence-backed lead research'
            USING ERRCODE = '22023';
    END IF;

    top_pain_point := report_record.pain_points -> 0;
    opportunity_text := NULLIF(
        btrim(top_pain_point ->> 'service_opportunity'),
        ''
    );
    IF opportunity_text IS NULL THEN
        RAISE EXCEPTION
            'Follow-up service opportunity is incomplete'
            USING ERRCODE = '22023';
    END IF;

    generated_subject := CASE
        WHEN original_message.platform = 'email' THEN
            left(
                'Re: ' || COALESCE(
                    original_message.subject,
                    'Idea for ' || lead_record.company_name
                ),
                300
            )
        ELSE NULL
    END;
    generated_content := concat_ws(
        E'\n\n',
        'Hello ' || contact_record.first_name || ',',
        CASE
            WHEN next_step.step_number = 1 THEN
                'I wanted to follow up on my earlier note about ' ||
                lower(opportunity_text) || ' for ' ||
                lead_record.company_name || '.'
            ELSE
                'One final follow-up on the ' ||
                lower(opportunity_text) || ' opportunity for ' ||
                lead_record.company_name || '.'
        END,
        CASE
            WHEN next_step.step_number = 1 THEN
                'Would it be useful if I shared one concise, practical idea?'
            ELSE
                'If it would help, I can send a short audit with practical next steps.'
        END,
        'If this is not relevant, just let me know and I will not follow up.',
        'Regards,'
    );

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
        'follow_up_step',
        next_step.id,
        'prepare_follow_up_draft',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'sequence_id', locked_sequence.id,
            'step_id', next_step.id,
            'step_number', next_step.step_number,
            'original_message_id', original_message.id,
            'research_report_id', report_record.id
        ),
        jsonb_build_object(
            'grounded_in_research', TRUE,
            'response_checked', TRUE,
            'human_approval_required', TRUE,
            'delivery_performed', FALSE
        ),
        follow_up_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_generation_action_id;

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
        'review_follow_up_compliance',
        'pending_approval',
        'normal',
        jsonb_build_object(
            'sequence_id', locked_sequence.id,
            'step_id', next_step.id,
            'step_number', next_step.step_number,
            'generation_action_id', created_generation_action_id,
            'original_message_id', original_message.id,
            'research_report_id', report_record.id
        ),
        jsonb_build_object(
            'checks', jsonb_build_array(
                jsonb_build_object(
                    'key', 'original_delivery_verified',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'response_absent',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'grounded_in_research',
                    'passed', TRUE
                ),
                jsonb_build_object(
                    'key', 'reachable_channel',
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
        locked_sequence.lead_id,
        locked_sequence.contact_id,
        original_message.platform,
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
        'Generated for response-aware follow-up step ' ||
            next_step.step_number
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
    WHERE id = created_generation_action_id
      AND workspace_id = check_workspace_id;

    UPDATE public.follow_up_steps
    SET
        status = 'draft_ready',
        message_id = created_message_id,
        generation_action_id = created_generation_action_id,
        compliance_action_id = created_compliance_action_id,
        prepared_at = clock_timestamp()
    WHERE id = next_step.id
      AND sequence_id = locked_sequence.id
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
        'follow_up_sequence',
        locked_sequence.id,
        'ai_agent',
        NULL,
        actor_member_id,
        follow_up_agent_id,
        'follow_up_draft_awaiting_review',
        jsonb_build_object(
            'sequence_id', locked_sequence.id,
            'step_id', next_step.id,
            'step_number', next_step.step_number,
            'message_id', created_message_id,
            'ai_action_id', created_compliance_action_id,
            'delivery_performed', FALSE
        )
    );

    RETURN QUERY
    SELECT
        'prepared'::TEXT,
        locked_sequence.status,
        next_step.id,
        created_message_id,
        created_compliance_action_id,
        next_step.due_at;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_due_follow_up(
    UUID,
    UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_due_follow_up(
    UUID,
    UUID
) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_due_follow_up(
    UUID,
    UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_follow_up_sequence_status(
    check_workspace_id UUID,
    check_sequence_id UUID,
    desired_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    locked_sequence public.follow_up_sequences%ROWTYPE;
    normalized_status TEXT := lower(btrim(desired_status));
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
            'Follow-up management requires manage_ai and manage_leads'
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

    IF normalized_status IS NULL
       OR normalized_status NOT IN ('active', 'paused', 'cancelled')
    THEN
        RAISE EXCEPTION 'Follow-up status is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT sequence.*
    INTO locked_sequence
    FROM public.follow_up_sequences sequence
    WHERE sequence.id = check_sequence_id
      AND sequence.workspace_id = check_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Follow-up sequence not found'
            USING ERRCODE = '22023';
    END IF;

    IF locked_sequence.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Completed follow-up sequence cannot be changed'
            USING ERRCODE = '22023';
    END IF;
    IF normalized_status = locked_sequence.status THEN
        RETURN locked_sequence.status;
    END IF;
    IF normalized_status = 'active'
       AND locked_sequence.status <> 'paused'
    THEN
        RAISE EXCEPTION 'Only a paused sequence can be resumed'
            USING ERRCODE = '22023';
    END IF;
    IF normalized_status = 'paused'
       AND locked_sequence.status <> 'active'
    THEN
        RAISE EXCEPTION 'Only an active sequence can be paused'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.follow_up_sequences
    SET
        status = normalized_status,
        stopped_reason = CASE
            WHEN normalized_status = 'cancelled'
            THEN 'cancelled_by_user'
            ELSE NULL
        END,
        completed_at = CASE
            WHEN normalized_status = 'cancelled'
            THEN clock_timestamp()
            ELSE NULL
        END
    WHERE id = locked_sequence.id
      AND workspace_id = check_workspace_id;

    IF normalized_status = 'cancelled' THEN
        UPDATE public.follow_up_steps
        SET status = 'cancelled'
        WHERE sequence_id = locked_sequence.id
          AND workspace_id = check_workspace_id
          AND status = 'planned';
    END IF;

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
        'follow_up_sequence',
        locked_sequence.id,
        'human',
        actor_user_id,
        actor_member_id,
        NULL,
        'follow_up_sequence_' || normalized_status,
        jsonb_build_object(
            'sequence_id', locked_sequence.id,
            'status', normalized_status
        )
    );

    RETURN normalized_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_follow_up_sequence_status(
    UUID,
    UUID,
    TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_follow_up_sequence_status(
    UUID,
    UUID,
    TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_follow_up_sequence_status(
    UUID,
    UUID,
    TEXT
) TO authenticated;
