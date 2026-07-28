-- ==========================================
-- 001_core_tenancy.sql
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- USERS
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKSPACES
CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    industry TEXT,
    timezone TEXT,
    country TEXT,
    currency TEXT,
    slug TEXT NOT NULL,
    logo_url TEXT,
    is_personal BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ
);

-- COMPANIES
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    legal_name TEXT,
    tax_id TEXT,
    website TEXT,
    address TEXT,
    billing_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- WORKSPACE MEMBERS
CREATE TABLE public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);


-- PERMISSIONS CATALOG
CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.permissions (key, description) VALUES 
('manage_members', 'Can invite and manage workspace members'),
('manage_ai', 'Can manage AI agents and approve AI actions'),
('manage_settings', 'Can update workspace settings'),
('manage_integrations', 'Can connect or disconnect integrations'),
('manage_projects', 'Can create and modify projects'),
('manage_clients', 'Can manage clients'),
('manage_leads', 'Can manage leads'),
('manage_tasks', 'Can assign and manage tasks'),
('manage_assets', 'Can upload and manage assets'),
('manage_meetings', 'Can schedule and manage meetings'),
('export_data', 'Can export workspace data'),
('delete_workspace', 'Can delete the workspace');

-- WORKSPACE PERMISSIONS
CREATE TABLE public.workspace_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_member_id UUID NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- WORKSPACE INVITES
CREATE TABLE public.workspace_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    granted_permissions JSONB DEFAULT '[]'::jsonb,
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRIGGERS TO ENFORCE BUSINESS LOGIC
CREATE OR REPLACE FUNCTION public.check_invite_not_personal()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = NEW.workspace_id AND is_personal = true) THEN
        RAISE EXCEPTION 'Cannot invite users to a personal workspace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_invite_not_personal
BEFORE INSERT ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.check_invite_not_personal();

-- INDEXES & CONSTRAINTS
CREATE UNIQUE INDEX idx_workspaces_slug ON public.workspaces(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspace_members_user_id ON public.workspace_members(user_id);
ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_id_workspace_id_key UNIQUE (id, workspace_id);
CREATE UNIQUE INDEX idx_workspace_members_active_user ON public.workspace_members(workspace_id, user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_workspace_permissions_member_permission ON public.workspace_permissions(workspace_member_id, permission_id);
CREATE INDEX idx_companies_workspace_id ON public.companies(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspace_invites_email ON public.workspace_invites(email);
CREATE INDEX idx_workspace_invites_token ON public.workspace_invites(token);
