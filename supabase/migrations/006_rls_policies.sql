-- ==========================================
-- 006_rls_policies.sql
-- ==========================================

-- ==========================================
-- ENABLE RLS
-- ==========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================
-- Note: public.has_workspace_permission is defined in 005_functions_and_triggers.sql.
-- Ensure that it exists before running this file.

-- ==========================================
-- POLICIES
-- ==========================================

-- 1. users
CREATE POLICY "users_select" ON public.users FOR SELECT USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.workspace_members wm1
    JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = auth.uid() AND wm2.user_id = users.id AND wm1.deleted_at IS NULL AND wm2.deleted_at IS NULL
));
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2. workspaces
CREATE POLICY "workspaces_select" ON public.workspaces FOR SELECT USING (
    deleted_at IS NULL AND public.is_active_workspace_member(id)
);
CREATE POLICY "workspaces_insert" ON public.workspaces FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND created_by = auth.uid()
);
CREATE POLICY "workspaces_update" ON public.workspaces FOR UPDATE USING (
    public.has_workspace_permission(id, 'manage_settings')
) WITH CHECK (
    public.has_workspace_permission(id, 'manage_settings')
);
CREATE POLICY "workspaces_delete" ON public.workspaces FOR DELETE USING (
    public.has_workspace_permission(id, 'delete_workspace')
);

-- 3. workspace_members
CREATE POLICY "workspace_members_select" ON public.workspace_members FOR SELECT USING (
    public.is_active_workspace_member(workspace_id)
);
CREATE POLICY "workspace_members_insert" ON public.workspace_members FOR INSERT WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_members')
);
CREATE POLICY "workspace_members_update" ON public.workspace_members FOR UPDATE USING (
    public.has_workspace_permission(workspace_id, 'manage_members')
) WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_members')
);
CREATE POLICY "workspace_members_delete" ON public.workspace_members FOR DELETE USING (
    public.has_workspace_permission(workspace_id, 'manage_members')
);

-- Permission catalog is readable by authenticated users and immutable to clients.
CREATE POLICY "permissions_select" ON public.permissions FOR SELECT USING (
    auth.uid() IS NOT NULL
);

-- 4. workspace_permissions
CREATE POLICY "workspace_permissions_select" ON public.workspace_permissions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm 
        WHERE wm.id = workspace_permissions.workspace_member_id AND wm.deleted_at IS NULL AND
              public.is_active_workspace_member(wm.workspace_id)
    )
);
CREATE POLICY "workspace_permissions_insert" ON public.workspace_permissions FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm 
        WHERE wm.id = workspace_permissions.workspace_member_id AND wm.deleted_at IS NULL AND
              public.has_workspace_permission(wm.workspace_id, 'manage_members')
    )
);
CREATE POLICY "workspace_permissions_update" ON public.workspace_permissions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm 
        WHERE wm.id = workspace_permissions.workspace_member_id AND wm.deleted_at IS NULL AND
              public.has_workspace_permission(wm.workspace_id, 'manage_members')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm 
        WHERE wm.id = workspace_permissions.workspace_member_id AND wm.deleted_at IS NULL AND
              public.has_workspace_permission(wm.workspace_id, 'manage_members')
    )
);
CREATE POLICY "workspace_permissions_delete" ON public.workspace_permissions FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.workspace_members wm 
        WHERE wm.id = workspace_permissions.workspace_member_id AND wm.deleted_at IS NULL AND
              public.has_workspace_permission(wm.workspace_id, 'manage_members')
    )
);

-- 5. workspace_invites
CREATE POLICY "workspace_invites_select" ON public.workspace_invites FOR SELECT USING (
    public.is_active_workspace_member(workspace_id)
    OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
);
CREATE POLICY "workspace_invites_insert" ON public.workspace_invites FOR INSERT WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_members')
);
CREATE POLICY "workspace_invites_update" ON public.workspace_invites FOR UPDATE USING (
    public.has_workspace_permission(workspace_id, 'manage_members')
) WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_members')
);
CREATE POLICY "workspace_invites_delete" ON public.workspace_invites FOR DELETE USING (
    public.has_workspace_permission(workspace_id, 'manage_members')
);

-- 6. companies
CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = companies.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (
    public.has_workspace_permission(workspace_id, 'manage_settings')
) WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_settings')
);
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (
    public.has_workspace_permission(workspace_id, 'manage_settings')
);

-- 7. ai_agents
CREATE POLICY "ai_agents_select" ON public.ai_agents FOR SELECT USING (
    deleted_at IS NULL AND (workspace_id IS NULL OR EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_agents.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL))
);
CREATE POLICY "ai_agents_insert" ON public.ai_agents FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_agents.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_agents_update" ON public.ai_agents FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_agents.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_agents.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_agents_delete" ON public.ai_agents FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_agents.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 8. ai_actions
CREATE POLICY "ai_actions_select" ON public.ai_actions FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_actions.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_actions_insert" ON public.ai_actions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_actions.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_actions_update" ON public.ai_actions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_actions.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_actions.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_actions_delete" ON public.ai_actions FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_actions.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 9. ai_approvals
CREATE POLICY "ai_approvals_select" ON public.ai_approvals FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ai_approvals.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "ai_approvals_insert" ON public.ai_approvals FOR INSERT WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_ai')
);
CREATE POLICY "ai_approvals_update" ON public.ai_approvals FOR UPDATE USING (
    public.has_workspace_permission(workspace_id, 'manage_ai')
) WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_ai')
);
CREATE POLICY "ai_approvals_delete" ON public.ai_approvals FOR DELETE USING (
    public.has_workspace_permission(workspace_id, 'manage_ai')
);

-- 10. integrations
CREATE POLICY "integrations_select" ON public.integrations FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = integrations.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "integrations_insert" ON public.integrations FOR INSERT WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_integrations')
);
CREATE POLICY "integrations_update" ON public.integrations FOR UPDATE USING (
    public.has_workspace_permission(workspace_id, 'manage_integrations')
) WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_integrations')
);
CREATE POLICY "integrations_delete" ON public.integrations FOR DELETE USING (
    public.has_workspace_permission(workspace_id, 'manage_integrations')
);

-- 11. clients
CREATE POLICY "clients_select" ON public.clients FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = clients.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = clients.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "clients_update" ON public.clients FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = clients.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = clients.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "clients_delete" ON public.clients FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = clients.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 12. leads
CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = leads.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 13. lead_scores
CREATE POLICY "lead_scores_select" ON public.lead_scores FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_scores.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_scores_insert" ON public.lead_scores FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_scores.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_scores_update" ON public.lead_scores FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_scores.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_scores.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_scores_delete" ON public.lead_scores FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_scores.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);

-- 14. lead_contacts
CREATE POLICY "lead_contacts_select" ON public.lead_contacts FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_contacts.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_contacts_insert" ON public.lead_contacts FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_contacts.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_contacts_update" ON public.lead_contacts FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_contacts.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_contacts.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "lead_contacts_delete" ON public.lead_contacts FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.leads l 
        WHERE l.id = lead_contacts.lead_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = l.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);

-- 15. outreach_messages
CREATE POLICY "outreach_messages_select" ON public.outreach_messages FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = outreach_messages.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "outreach_messages_insert" ON public.outreach_messages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = outreach_messages.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "outreach_messages_update" ON public.outreach_messages FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = outreach_messages.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = outreach_messages.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "outreach_messages_delete" ON public.outreach_messages FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = outreach_messages.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 16. message_versions
CREATE POLICY "message_versions_select" ON public.message_versions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.outreach_messages m 
        WHERE m.id = message_versions.outreach_message_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "message_versions_insert" ON public.message_versions FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.outreach_messages m 
        WHERE m.id = message_versions.outreach_message_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "message_versions_update" ON public.message_versions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.outreach_messages m 
        WHERE m.id = message_versions.outreach_message_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.outreach_messages m 
        WHERE m.id = message_versions.outreach_message_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);
CREATE POLICY "message_versions_delete" ON public.message_versions FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.outreach_messages m 
        WHERE m.id = message_versions.outreach_message_id AND 
              EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = m.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
    )
);

-- 17. projects
CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 18. tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE p.id = tasks.project_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL
    )
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE p.id = tasks.project_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL
    )
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE p.id = tasks.project_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE p.id = tasks.project_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL
    )
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON p.workspace_id = wm.workspace_id
        WHERE p.id = tasks.project_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL
    )
);

-- 19. meetings
CREATE POLICY "Active members can view active meetings"
ON public.meetings FOR SELECT
USING (
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meetings.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
);

CREATE POLICY "manage_meetings can view archived meetings"
ON public.meetings FOR SELECT
USING (
    deleted_at IS NOT NULL AND
    public.has_workspace_permission(workspace_id, 'manage_meetings')
);

CREATE POLICY "manage_meetings can insert meetings"
ON public.meetings FOR INSERT
WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_meetings'));

CREATE POLICY "manage_meetings can update meetings"
ON public.meetings FOR UPDATE
USING (public.has_workspace_permission(workspace_id, 'manage_meetings'))
WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_meetings'));

-- 20. meeting_participants
CREATE POLICY "Active members can view active meeting participants"
ON public.meeting_participants FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_participants.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL) AND
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.deleted_at IS NULL)
);

CREATE POLICY "manage_meetings can view archived meeting participants"
ON public.meeting_participants FOR SELECT
USING (
    public.has_workspace_permission(workspace_id, 'manage_meetings') AND
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.deleted_at IS NOT NULL)
);

CREATE POLICY "manage_meetings can insert participants to mutable meetings"
ON public.meeting_participants FOR INSERT
WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_meetings') AND
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.status IN ('requested', 'scheduled') AND m.deleted_at IS NULL) AND
    EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = workspace_member_id
          AND wm.workspace_id = meeting_participants.workspace_id
          AND wm.deleted_at IS NULL
    )
);

CREATE POLICY "manage_meetings can delete participants from mutable meetings"
ON public.meeting_participants FOR DELETE
USING (
    public.has_workspace_permission(workspace_id, 'manage_meetings') AND
    EXISTS (
        SELECT 1
        FROM public.meetings m
        WHERE m.id = meeting_participants.meeting_id
          AND m.status IN ('requested', 'scheduled')
          AND m.deleted_at IS NULL
          AND m.organizer_id IS DISTINCT FROM meeting_participants.workspace_member_id
    )
);

-- 21. availability_slots
CREATE POLICY "Active members can view availability"
ON public.availability_slots FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = availability_slots.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
);

CREATE POLICY "Members manage own availability or manage_meetings"
ON public.availability_slots FOR INSERT
WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_meetings')
    OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.id = availability_slots.workspace_member_id AND wm.workspace_id = availability_slots.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
);

CREATE POLICY "Members update own availability or manage_meetings"
ON public.availability_slots FOR UPDATE
USING (
    public.has_workspace_permission(workspace_id, 'manage_meetings')
    OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.id = availability_slots.workspace_member_id AND wm.workspace_id = availability_slots.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
)
WITH CHECK (
    public.has_workspace_permission(workspace_id, 'manage_meetings')
    OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.id = availability_slots.workspace_member_id AND wm.workspace_id = availability_slots.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
);

CREATE POLICY "Members delete own availability or manage_meetings"
ON public.availability_slots FOR DELETE
USING (
    public.has_workspace_permission(workspace_id, 'manage_meetings')
    OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.id = availability_slots.workspace_member_id AND wm.workspace_id = availability_slots.workspace_id AND wm.user_id = auth.uid() AND wm.deleted_at IS NULL)
);

-- 22. assets
CREATE POLICY "assets_select" ON public.assets FOR SELECT USING (
    deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = assets.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "assets_insert" ON public.assets FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = assets.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "assets_update" ON public.assets FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = assets.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = assets.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "assets_delete" ON public.assets FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = assets.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);

-- 23. activities
CREATE POLICY "activities_select" ON public.activities FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = activities.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
CREATE POLICY "activities_insert" ON public.activities FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = activities.workspace_id AND user_id = auth.uid() AND deleted_at IS NULL)
);
-- Activity rows are append-only. No UPDATE or DELETE policy is intentionally
-- defined, so authenticated clients cannot rewrite or erase the audit trail.
