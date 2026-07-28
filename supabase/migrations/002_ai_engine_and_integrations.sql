-- ==========================================
-- 002_ai_engine_and_integrations.sql
-- ==========================================

-- ENUMS
CREATE TYPE ai_action_status AS ENUM ('pending_approval', 'approved', 'rejected', 'executing', 'completed', 'failed');
CREATE TYPE ai_approval_decision AS ENUM ('approved', 'rejected');
CREATE TYPE integration_provider AS ENUM ('google', 'stripe', 'quickbooks', 'hubspot', 'slack', 'mailchimp', 'zoom');

-- AI AGENTS
CREATE TABLE public.ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE, -- Nullable for system-wide agents (e.g. Ralph)
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TYPE public.ai_action_priority AS ENUM ('low', 'normal', 'high', 'critical');

-- AI ACTIONS
CREATE TABLE public.ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action_type TEXT NOT NULL,
    status ai_action_status NOT NULL DEFAULT 'pending_approval',
    priority ai_action_priority NOT NULL DEFAULT 'normal',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    payload JSONB NOT NULL,
    result_data JSONB,
    agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- AI APPROVALS
CREATE TABLE public.ai_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_action_id UUID NOT NULL UNIQUE REFERENCES public.ai_actions(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    decision ai_approval_decision NOT NULL,
    reason TEXT,
    approved_payload JSONB,
    decided_at TIMESTAMPTZ DEFAULT NOW()
);

-- INTEGRATIONS
CREATE TABLE public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider integration_provider NOT NULL,
    status TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, provider)
);

-- INDEXES
CREATE INDEX idx_ai_agents_workspace ON public.ai_agents(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_actions_workspace_status ON public.ai_actions(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_actions_entity ON public.ai_actions(entity_type, entity_id);
CREATE INDEX idx_ai_approvals_action ON public.ai_approvals(ai_action_id);
CREATE INDEX idx_ai_approvals_workspace ON public.ai_approvals(workspace_id);
CREATE INDEX idx_integrations_workspace ON public.integrations(workspace_id);
CREATE INDEX idx_integrations_provider ON public.integrations(provider);
