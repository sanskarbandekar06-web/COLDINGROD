-- ==========================================
-- 004_work_system_and_assets.sql
-- ==========================================

CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'in_review', 'completed', 'cancelled');
CREATE TYPE meeting_status AS ENUM ('requested', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE activity_actor_type AS ENUM ('human', 'ai_agent', 'system');

-- PROJECTS
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status project_status NOT NULL DEFAULT 'planning',
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- TASKS
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status task_status NOT NULL DEFAULT 'todo',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Add required unique constraints for composite FKs
ALTER TABLE public.clients ADD CONSTRAINT clients_id_workspace_id_key UNIQUE (id, workspace_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_id_workspace_id_key UNIQUE (id, workspace_id);
ALTER TABLE public.projects ADD CONSTRAINT projects_id_workspace_id_key UNIQUE (id, workspace_id);

-- MEETINGS
CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    organizer_id UUID REFERENCES public.workspace_members(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status public.meeting_status NOT NULL DEFAULT 'requested',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    location TEXT,
    meet_link TEXT,
    
    client_id UUID,
    lead_id UUID,
    project_id UUID,
    
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT meetings_time_completeness CHECK (
        (start_time IS NULL AND end_time IS NULL) OR 
        (start_time IS NOT NULL AND end_time IS NOT NULL)
    ),
    CONSTRAINT meetings_end_after_start CHECK (
        start_time IS NULL OR end_time > start_time
    ),
    CONSTRAINT meetings_status_time_req CHECK (
        status IN ('requested', 'cancelled') OR 
        (start_time IS NOT NULL AND end_time IS NOT NULL)
    ),
    
    FOREIGN KEY (client_id, workspace_id) REFERENCES public.clients(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (lead_id, workspace_id) REFERENCES public.leads(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id, workspace_id) REFERENCES public.projects(id, workspace_id) ON DELETE RESTRICT,

    CONSTRAINT meetings_id_workspace_id_key UNIQUE (id, workspace_id)
);

-- MEETING PARTICIPANTS
CREATE TABLE public.meeting_participants (
    meeting_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (meeting_id, workspace_member_id),
    
    FOREIGN KEY (meeting_id, workspace_id) REFERENCES public.meetings(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_member_id, workspace_id) REFERENCES public.workspace_members(id, workspace_id) ON DELETE CASCADE
);

-- AVAILABILITY SLOTS
CREATE TABLE public.availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT availability_end_after_start CHECK (end_time > start_time),
    CONSTRAINT availability_slots_no_overlap EXCLUDE USING gist (
        workspace_member_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    ),
    FOREIGN KEY (workspace_member_id, workspace_id) REFERENCES public.workspace_members(id, workspace_id) ON DELETE CASCADE
);

CREATE TYPE public.asset_upload_source AS ENUM ('client', 'lead', 'project', 'portfolio', 'analysis', 'summary', 'general');

-- ASSETS
CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ACTIVITIES
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    actor_type activity_actor_type NOT NULL,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    workspace_member_id UUID REFERENCES public.workspace_members(id) ON DELETE SET NULL,
    actor_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_projects_workspace ON public.projects(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_project ON public.tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_meetings_upcoming ON public.meetings(workspace_id, start_time) WHERE deleted_at IS NULL AND start_time IS NOT NULL;
CREATE INDEX idx_meeting_participants_member ON public.meeting_participants(workspace_id, workspace_member_id);
CREATE INDEX idx_availability_slots_ws_member ON public.availability_slots(workspace_id, workspace_member_id, start_time);
CREATE INDEX idx_assets_workspace_entity ON public.assets(workspace_id, entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_uploaded_by ON public.assets(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_activities_workspace_created ON public.activities(workspace_id, created_at DESC);
CREATE INDEX idx_activities_entity ON public.activities(entity_type, entity_id);
