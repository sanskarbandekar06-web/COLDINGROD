-- ==========================================
-- 007_authenticated_grants_and_rls_hardening.sql
-- ==========================================

-- RLS policies are evaluated only after ordinary SQL privileges succeed.
-- Keep the public data model authenticated-only; Auth API endpoints are separate.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Preserve the same privilege posture for future migrations created by postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

-- Workspace creation is performed by SECURITY DEFINER RPCs/triggers so membership
-- and owner permissions are created atomically. Block orphan direct inserts.
ALTER POLICY "workspaces_insert" ON public.workspaces
    WITH CHECK (false);

-- Company profile writes require workspace settings permission.
ALTER POLICY "companies_insert" ON public.companies
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_settings'));

-- AI agents and actions are writable only by AI managers.
ALTER POLICY "ai_agents_insert" ON public.ai_agents
    WITH CHECK (workspace_id IS NOT NULL AND public.has_workspace_permission(workspace_id, 'manage_ai'));
ALTER POLICY "ai_agents_update" ON public.ai_agents
    USING (workspace_id IS NOT NULL AND public.has_workspace_permission(workspace_id, 'manage_ai'))
    WITH CHECK (workspace_id IS NOT NULL AND public.has_workspace_permission(workspace_id, 'manage_ai'));
ALTER POLICY "ai_agents_delete" ON public.ai_agents
    USING (workspace_id IS NOT NULL AND public.has_workspace_permission(workspace_id, 'manage_ai'));

ALTER POLICY "ai_actions_insert" ON public.ai_actions
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_ai'));
ALTER POLICY "ai_actions_update" ON public.ai_actions
    USING (public.has_workspace_permission(workspace_id, 'manage_ai'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_ai'));
ALTER POLICY "ai_actions_delete" ON public.ai_actions
    USING (public.has_workspace_permission(workspace_id, 'manage_ai'));

-- Client writes require manage_clients.
ALTER POLICY "clients_insert" ON public.clients
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_clients'));
ALTER POLICY "clients_update" ON public.clients
    USING (public.has_workspace_permission(workspace_id, 'manage_clients'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_clients'));
ALTER POLICY "clients_delete" ON public.clients
    USING (public.has_workspace_permission(workspace_id, 'manage_clients'));

-- Lead, contact, score, outreach, and message-version writes require manage_leads.
ALTER POLICY "leads_insert" ON public.leads
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_leads'));
ALTER POLICY "leads_update" ON public.leads
    USING (public.has_workspace_permission(workspace_id, 'manage_leads'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_leads'));
ALTER POLICY "leads_delete" ON public.leads
    USING (public.has_workspace_permission(workspace_id, 'manage_leads'));

ALTER POLICY "lead_scores_insert" ON public.lead_scores
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_scores.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));
ALTER POLICY "lead_scores_update" ON public.lead_scores
    USING (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_scores.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_scores.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));
ALTER POLICY "lead_scores_delete" ON public.lead_scores
    USING (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_scores.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));

ALTER POLICY "lead_contacts_insert" ON public.lead_contacts
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_contacts.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));
ALTER POLICY "lead_contacts_update" ON public.lead_contacts
    USING (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_contacts.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_contacts.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));
ALTER POLICY "lead_contacts_delete" ON public.lead_contacts
    USING (EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_contacts.lead_id
          AND public.has_workspace_permission(l.workspace_id, 'manage_leads')
    ));

ALTER POLICY "outreach_messages_insert" ON public.outreach_messages
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_leads'));
ALTER POLICY "outreach_messages_update" ON public.outreach_messages
    USING (public.has_workspace_permission(workspace_id, 'manage_leads'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_leads'));
ALTER POLICY "outreach_messages_delete" ON public.outreach_messages
    USING (public.has_workspace_permission(workspace_id, 'manage_leads'));

ALTER POLICY "message_versions_insert" ON public.message_versions
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.outreach_messages m
        WHERE m.id = message_versions.outreach_message_id
          AND public.has_workspace_permission(m.workspace_id, 'manage_leads')
    ));
ALTER POLICY "message_versions_update" ON public.message_versions
    USING (EXISTS (
        SELECT 1 FROM public.outreach_messages m
        WHERE m.id = message_versions.outreach_message_id
          AND public.has_workspace_permission(m.workspace_id, 'manage_leads')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.outreach_messages m
        WHERE m.id = message_versions.outreach_message_id
          AND public.has_workspace_permission(m.workspace_id, 'manage_leads')
    ));
ALTER POLICY "message_versions_delete" ON public.message_versions
    USING (EXISTS (
        SELECT 1 FROM public.outreach_messages m
        WHERE m.id = message_versions.outreach_message_id
          AND public.has_workspace_permission(m.workspace_id, 'manage_leads')
    ));

-- Project, task, and asset writes use their matching permissions.
ALTER POLICY "projects_insert" ON public.projects
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_projects'));
ALTER POLICY "projects_update" ON public.projects
    USING (public.has_workspace_permission(workspace_id, 'manage_projects'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_projects'));
ALTER POLICY "projects_delete" ON public.projects
    USING (public.has_workspace_permission(workspace_id, 'manage_projects'));

ALTER POLICY "tasks_insert" ON public.tasks
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id
          AND p.workspace_id = tasks.workspace_id
          AND public.has_workspace_permission(p.workspace_id, 'manage_tasks')
    ));
ALTER POLICY "tasks_update" ON public.tasks
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id
          AND p.workspace_id = tasks.workspace_id
          AND public.has_workspace_permission(p.workspace_id, 'manage_tasks')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id
          AND p.workspace_id = tasks.workspace_id
          AND public.has_workspace_permission(p.workspace_id, 'manage_tasks')
    ));
ALTER POLICY "tasks_delete" ON public.tasks
    USING (EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id
          AND p.workspace_id = tasks.workspace_id
          AND public.has_workspace_permission(p.workspace_id, 'manage_tasks')
    ));

ALTER POLICY "assets_insert" ON public.assets
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_assets'));
ALTER POLICY "assets_update" ON public.assets
    USING (public.has_workspace_permission(workspace_id, 'manage_assets'))
    WITH CHECK (public.has_workspace_permission(workspace_id, 'manage_assets'));
ALTER POLICY "assets_delete" ON public.assets
    USING (public.has_workspace_permission(workspace_id, 'manage_assets'));
