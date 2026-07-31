-- ==========================================
-- 020_analytics_and_optimization.sql
-- Phase 3.6: immutable funnel analytics and deterministic recommendations
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
    '00000000-0000-4000-8000-000000000308',
    NULL,
    'Analytics and Optimization Agent',
    'Builds immutable workspace funnel snapshots and recommends the next operational improvement from stored outcomes.',
    'Calculate only from workspace-scoped database records. Preserve period boundaries and denominators. Make deterministic recommendations; never invent performance or claim causation.',
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

CREATE TABLE public.workspace_analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id) ON DELETE CASCADE,
    period_days INTEGER NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    metrics JSONB NOT NULL,
    recommendations JSONB NOT NULL,
    action_id UUID NOT NULL
        REFERENCES public.ai_actions(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL
        REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workspace_analytics_period_days
        CHECK (period_days IN (7, 30, 90)),
    CONSTRAINT workspace_analytics_period_order
        CHECK (period_end > period_start),
    CONSTRAINT workspace_analytics_metrics_object
        CHECK (jsonb_typeof(metrics) = 'object'),
    CONSTRAINT workspace_analytics_recommendations_array
        CHECK (jsonb_typeof(recommendations) = 'array'),
    CONSTRAINT workspace_analytics_action_unique UNIQUE (action_id)
);

CREATE INDEX idx_workspace_analytics_recent
    ON public.workspace_analytics_snapshots(
        workspace_id,
        created_at DESC
    );

ALTER TABLE public.workspace_analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_analytics_snapshots_select"
ON public.workspace_analytics_snapshots
FOR SELECT
USING (public.is_active_workspace_member(workspace_id));

REVOKE ALL PRIVILEGES
ON TABLE public.workspace_analytics_snapshots FROM anon;
REVOKE ALL PRIVILEGES
ON TABLE public.workspace_analytics_snapshots FROM authenticated;
GRANT SELECT
ON TABLE public.workspace_analytics_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.run_workspace_analytics(
    check_workspace_id UUID,
    check_period_days INTEGER
)
RETURNS TABLE (
    snapshot_id UUID,
    action_id UUID,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    analytics_agent_id CONSTANT UUID :=
        '00000000-0000-4000-8000-000000000308';
    actor_user_id UUID := auth.uid();
    actor_member_id UUID;
    calculated_period_end TIMESTAMPTZ := clock_timestamp();
    calculated_period_start TIMESTAMPTZ;
    leads_created INTEGER := 0;
    qualified_leads INTEGER := 0;
    research_reports INTEGER := 0;
    ai_generated_messages INTEGER := 0;
    approved_messages INTEGER := 0;
    sent_messages INTEGER := 0;
    responses INTEGER := 0;
    meetings_scheduled INTEGER := 0;
    won_leads INTEGER := 0;
    pending_approvals INTEGER := 0;
    active_follow_ups INTEGER := 0;
    average_score INTEGER := 0;
    approval_rate NUMERIC := 0;
    delivery_rate NUMERIC := 0;
    response_rate NUMERIC := 0;
    meeting_rate NUMERIC := 0;
    calculated_metrics JSONB;
    calculated_recommendations JSONB := '[]'::JSONB;
    created_action_id UUID;
    created_snapshot_id UUID;
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
            'Analytics requires manage_ai and manage_leads'
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

    IF check_period_days IS NULL
       OR check_period_days NOT IN (7, 30, 90)
    THEN
        RAISE EXCEPTION 'Analytics period must be 7, 30, or 90 days'
            USING ERRCODE = '22023';
    END IF;
    calculated_period_start :=
        calculated_period_end -
        (check_period_days * INTERVAL '1 day');

    SELECT count(*)::INTEGER
    INTO leads_created
    FROM public.leads lead
    WHERE lead.workspace_id = check_workspace_id
      AND lead.created_at >= calculated_period_start
      AND lead.created_at <= calculated_period_end
      AND lead.deleted_at IS NULL;

    SELECT
        count(DISTINCT score.lead_id)::INTEGER,
        COALESCE(round(avg(score.score))::INTEGER, 0)
    INTO qualified_leads, average_score
    FROM public.lead_scores score
    JOIN public.leads lead
      ON lead.id = score.lead_id
     AND lead.workspace_id = check_workspace_id
     AND lead.deleted_at IS NULL
    WHERE score.scored_at >= calculated_period_start
      AND score.scored_at <= calculated_period_end
      AND score.score >= 65;

    SELECT count(*)::INTEGER
    INTO research_reports
    FROM public.lead_research_reports report
    WHERE report.workspace_id = check_workspace_id
      AND report.created_at >= calculated_period_start
      AND report.created_at <= calculated_period_end;

    SELECT count(*)::INTEGER
    INTO ai_generated_messages
    FROM public.outreach_messages message
    WHERE message.workspace_id = check_workspace_id
      AND message.direction = 'outbound'
      AND message.ai_action_id IS NOT NULL
      AND message.created_at >= calculated_period_start
      AND message.created_at <= calculated_period_end
      AND message.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO approved_messages
    FROM public.ai_approvals approval
    JOIN public.ai_actions action
      ON action.id = approval.ai_action_id
     AND action.workspace_id = approval.workspace_id
    JOIN public.outreach_messages message
      ON message.id = action.entity_id
     AND message.workspace_id = action.workspace_id
    WHERE approval.workspace_id = check_workspace_id
      AND approval.decision = 'approved'
      AND approval.decided_at >= calculated_period_start
      AND approval.decided_at <= calculated_period_end
      AND action.entity_type = 'outreach_message'
      AND action.deleted_at IS NULL
      AND message.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO sent_messages
    FROM public.outreach_messages message
    WHERE message.workspace_id = check_workspace_id
      AND message.direction = 'outbound'
      AND message.sent_at >= calculated_period_start
      AND message.sent_at <= calculated_period_end
      AND message.status IN ('sent', 'delivered', 'replied')
      AND message.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO responses
    FROM public.outreach_messages message
    WHERE message.workspace_id = check_workspace_id
      AND message.deleted_at IS NULL
      AND (
          (
              message.direction = 'inbound'
              AND message.created_at >= calculated_period_start
              AND message.created_at <= calculated_period_end
          )
          OR (
              message.direction = 'outbound'
              AND message.status = 'replied'
              AND message.updated_at >= calculated_period_start
              AND message.updated_at <= calculated_period_end
          )
      );

    SELECT count(*)::INTEGER
    INTO meetings_scheduled
    FROM public.meetings meeting
    WHERE meeting.workspace_id = check_workspace_id
      AND meeting.status IN ('scheduled', 'in_progress', 'completed')
      AND meeting.start_time >= calculated_period_start
      AND meeting.start_time <= calculated_period_end
      AND meeting.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO won_leads
    FROM public.leads lead
    WHERE lead.workspace_id = check_workspace_id
      AND lead.status = 'won'
      AND lead.updated_at >= calculated_period_start
      AND lead.updated_at <= calculated_period_end
      AND lead.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO pending_approvals
    FROM public.ai_actions action
    WHERE action.workspace_id = check_workspace_id
      AND action.status = 'pending_approval'
      AND action.deleted_at IS NULL;

    SELECT count(*)::INTEGER
    INTO active_follow_ups
    FROM public.follow_up_sequences sequence
    WHERE sequence.workspace_id = check_workspace_id
      AND sequence.status IN ('active', 'paused');

    approval_rate := CASE
        WHEN ai_generated_messages = 0 THEN 0
        ELSE round(
            LEAST(
                100,
                approved_messages::NUMERIC * 100 /
                    ai_generated_messages
            ),
            1
        )
    END;
    delivery_rate := CASE
        WHEN approved_messages = 0 THEN 0
        ELSE round(
            LEAST(
                100,
                sent_messages::NUMERIC * 100 / approved_messages
            ),
            1
        )
    END;
    response_rate := CASE
        WHEN sent_messages = 0 THEN 0
        ELSE round(
            LEAST(
                100,
                responses::NUMERIC * 100 / sent_messages
            ),
            1
        )
    END;
    meeting_rate := CASE
        WHEN responses = 0 THEN 0
        ELSE round(
            LEAST(
                100,
                meetings_scheduled::NUMERIC * 100 / responses
            ),
            1
        )
    END;

    calculated_metrics := jsonb_build_object(
        'leads_created', leads_created,
        'qualified_leads', qualified_leads,
        'research_reports', research_reports,
        'ai_generated_messages', ai_generated_messages,
        'approved_messages', approved_messages,
        'sent_messages', sent_messages,
        'responses', responses,
        'meetings_scheduled', meetings_scheduled,
        'won_leads', won_leads,
        'pending_approvals', pending_approvals,
        'active_follow_up_sequences', active_follow_ups,
        'average_opportunity_score', average_score,
        'approval_rate', approval_rate,
        'delivery_rate', delivery_rate,
        'response_rate', response_rate,
        'meeting_rate', meeting_rate,
        'funnel', jsonb_build_array(
            jsonb_build_object(
                'key', 'leads',
                'label', 'New leads',
                'value', leads_created
            ),
            jsonb_build_object(
                'key', 'qualified',
                'label', 'Qualified opportunities',
                'value', qualified_leads
            ),
            jsonb_build_object(
                'key', 'approved',
                'label', 'Approved outreach',
                'value', approved_messages
            ),
            jsonb_build_object(
                'key', 'sent',
                'label', 'Verified sent',
                'value', sent_messages
            ),
            jsonb_build_object(
                'key', 'responses',
                'label', 'Responses',
                'value', responses
            ),
            jsonb_build_object(
                'key', 'meetings',
                'label', 'Meetings',
                'value', meetings_scheduled
            ),
            jsonb_build_object(
                'key', 'won',
                'label', 'Won leads',
                'value', won_leads
            )
        ),
        'rules_version', 'coldingrod-analytics-v1'
    );

    IF leads_created = 0 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'discover_leads',
                    'priority', 'high',
                    'title', 'Build the lead pipeline',
                    'detail',
                        'No new leads were recorded in this period. Run lead discovery and explicitly review candidates.'
                )
            );
    ELSIF qualified_leads = 0 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'qualify_leads',
                    'priority', 'high',
                    'title', 'Qualify recent leads',
                    'detail',
                        'New leads exist, but none reached the 65-point opportunity threshold in this period.'
                )
            );
    END IF;

    IF qualified_leads > 0 AND ai_generated_messages = 0 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'prepare_outreach',
                    'priority', 'high',
                    'title', 'Turn research into outreach',
                    'detail',
                        'Qualified opportunities exist without AI-generated outreach in this period.'
                )
            );
    END IF;

    IF pending_approvals > 0 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'review_pending',
                    'priority', 'high',
                    'title', 'Clear the approval queue',
                    'detail',
                        pending_approvals::TEXT ||
                        ' AI action(s) are waiting for a human decision.'
                )
            );
    END IF;

    IF approved_messages > sent_messages THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'connect_delivery',
                    'priority', 'medium',
                    'title', 'Connect verified delivery',
                    'detail',
                        'Approved outreach exceeds verified sends. Configure a Phase 4 provider before starting follow-up timing.'
                )
            );
    END IF;

    IF sent_messages >= 3 AND response_rate < 20 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'improve_response_rate',
                    'priority', 'medium',
                    'title', 'Review personalization and cadence',
                    'detail',
                        'The verified response rate is below 20%. Review evidence grounding, call to action, and follow-up timing.'
                )
            );
    END IF;

    IF responses > meetings_scheduled THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'convert_responses',
                    'priority', 'medium',
                    'title', 'Convert responses into meetings',
                    'detail',
                        'Responses exceed scheduled meetings. Add a clear next-step workflow for interested contacts.'
                )
            );
    END IF;

    IF sent_messages > 0 AND active_follow_ups = 0 THEN
        calculated_recommendations :=
            calculated_recommendations || jsonb_build_array(
                jsonb_build_object(
                    'key', 'start_follow_ups',
                    'priority', 'low',
                    'title', 'Use response-aware follow-ups',
                    'detail',
                        'Verified sends exist without an active follow-up sequence.'
                )
            );
    END IF;

    IF jsonb_array_length(calculated_recommendations) = 0 THEN
        calculated_recommendations := jsonb_build_array(
            jsonb_build_object(
                'key', 'maintain_workflow',
                'priority', 'low',
                'title', 'Maintain the current workflow',
                'detail',
                    'No deterministic bottleneck rule was triggered for this period. Continue collecting verified outcomes.'
            )
        );
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
        'workspace_analytics_snapshot',
        NULL,
        'analyze_workspace_funnel',
        'completed',
        'normal',
        NOW(),
        clock_timestamp(),
        jsonb_build_object(
            'period_days', check_period_days,
            'period_start', calculated_period_start,
            'period_end', calculated_period_end
        ),
        jsonb_build_object(
            'metrics', calculated_metrics,
            'recommendations', calculated_recommendations,
            'recommendation_count',
                jsonb_array_length(calculated_recommendations)
        ),
        analytics_agent_id,
        actor_user_id
    )
    RETURNING id INTO created_action_id;

    INSERT INTO public.workspace_analytics_snapshots (
        workspace_id,
        period_days,
        period_start,
        period_end,
        metrics,
        recommendations,
        action_id,
        created_by
    )
    VALUES (
        check_workspace_id,
        check_period_days,
        calculated_period_start,
        calculated_period_end,
        calculated_metrics,
        calculated_recommendations,
        created_action_id,
        actor_user_id
    )
    RETURNING id INTO created_snapshot_id;

    UPDATE public.ai_actions
    SET
        entity_id = created_snapshot_id,
        result_data = result_data || jsonb_build_object(
            'snapshot_id', created_snapshot_id
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
        'workspace_analytics_snapshot',
        created_snapshot_id,
        'ai_agent',
        NULL,
        actor_member_id,
        analytics_agent_id,
        'workspace_analytics_completed',
        jsonb_build_object(
            'snapshot_id', created_snapshot_id,
            'ai_action_id', created_action_id,
            'period_days', check_period_days,
            'recommendation_count',
                jsonb_array_length(calculated_recommendations)
        )
    );

    RETURN QUERY
    SELECT
        created_snapshot_id,
        created_action_id,
        calculated_period_start,
        calculated_period_end;
END;
$$;

REVOKE ALL ON FUNCTION public.run_workspace_analytics(
    UUID,
    INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_workspace_analytics(
    UUID,
    INTEGER
) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_workspace_analytics(
    UUID,
    INTEGER
) TO authenticated;
