-- ==========================================
-- 003_business_entities.sql
-- ==========================================

CREATE TYPE outreach_platform AS ENUM ('instagram', 'email', 'linkedin', 'whatsapp', 'facebook', 'sms');
CREATE TYPE outreach_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE lead_status AS ENUM ('new', 'analyzed', 'contacted', 'responded', 'meeting_scheduled', 'won', 'lost');
CREATE TYPE outreach_status AS ENUM ('draft', 'pending_approval', 'scheduled', 'sent', 'delivered', 'failed', 'replied');

-- CLIENTS
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- LEADS
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    status lead_status NOT NULL DEFAULT 'new',
    source TEXT,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- LEAD SCORES
CREATE TABLE public.lead_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    algorithm_version TEXT,
    factors JSONB,
    ai_action_id UUID REFERENCES public.ai_actions(id) ON DELETE SET NULL,
    scored_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEAD CONTACTS
CREATE TABLE public.lead_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT,
    job_title TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    instagram_handle TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OUTREACH MESSAGES
CREATE TABLE public.outreach_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.lead_contacts(id) ON DELETE SET NULL,
    platform outreach_platform NOT NULL,
    direction outreach_direction NOT NULL,
    subject TEXT,
    content TEXT NOT NULL,
    status outreach_status NOT NULL DEFAULT 'draft',
    ai_action_id UUID REFERENCES public.ai_actions(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- MESSAGE VERSIONS
CREATE TABLE public.message_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outreach_message_id UUID NOT NULL REFERENCES public.outreach_messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    edited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_clients_workspace ON public.clients(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_workspace_status ON public.leads(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_contacts_lead ON public.lead_contacts(lead_id);
CREATE INDEX idx_lead_scores_lead ON public.lead_scores(lead_id);
CREATE INDEX idx_outreach_messages_lead ON public.outreach_messages(lead_id);
CREATE INDEX idx_outreach_messages_contact ON public.outreach_messages(contact_id);
CREATE INDEX idx_outreach_messages_status ON public.outreach_messages(workspace_id, status);
CREATE INDEX idx_message_versions_message ON public.message_versions(outreach_message_id);
