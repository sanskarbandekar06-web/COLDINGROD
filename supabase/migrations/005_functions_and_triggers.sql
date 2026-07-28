-- ==========================================
-- 005_functions_and_triggers.sql
-- ==========================================

-- 1. Helper Function: Check Workspace Permission
CREATE OR REPLACE FUNCTION public.has_workspace_permission(check_workspace_id UUID, req_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.workspace_permissions wp
        JOIN public.workspace_members wm ON wp.workspace_member_id = wm.id
        JOIN public.workspaces w ON wm.workspace_id = w.id
        JOIN public.permissions p ON wp.permission_id = p.id
        WHERE wm.workspace_id = check_workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
          AND w.deleted_at IS NULL
          AND p.key = req_permission
    );
$$;

REVOKE ALL ON FUNCTION public.has_workspace_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(UUID, TEXT) TO authenticated;

-- RLS-safe active membership check. As a SECURITY DEFINER function it avoids
-- recursive evaluation of workspace_members policies.
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(check_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        JOIN public.workspaces w ON w.id = wm.workspace_id
        WHERE wm.workspace_id = check_workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
          AND w.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_active_workspace_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) TO authenticated;

-- 2. Trigger Function: updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach updated_at triggers to relevant tables
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_workspaces BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_companies BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_ai_actions BEFORE UPDATE ON public.ai_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_clients BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_leads BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_tasks BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_meetings BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_availability_slots BEFORE UPDATE ON public.availability_slots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_outreach_messages BEFORE UPDATE ON public.outreach_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_ai_agents BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to validate active organizer on assignment without blocking archive updates
CREATE OR REPLACE FUNCTION public.validate_active_organizer()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.organizer_id IS DISTINCT FROM OLD.organizer_id THEN
        IF NEW.organizer_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE id = NEW.organizer_id AND workspace_id = NEW.workspace_id AND deleted_at IS NULL) THEN
                RAISE EXCEPTION 'Organizer must be an active workspace member';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_active_organizer BEFORE INSERT OR UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.validate_active_organizer();

-- 3. Trigger Function: Auth User Creation -> Personal Workspace Setup
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id UUID;
    new_workspace_id UUID;
    new_member_id UUID;
    workspace_name TEXT;
BEGIN
    new_user_id := NEW.id;

    -- Extract name or fallback to email
    IF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
        workspace_name := (NEW.raw_user_meta_data->>'full_name') || '''s Workspace';
    ELSE
        workspace_name := split_part(NEW.email, '@', 1) || '''s Workspace';
    END IF;

    -- Create public.users record
    INSERT INTO public.users (id, email, full_name)
    VALUES (new_user_id, NEW.email, NEW.raw_user_meta_data->>'full_name');

    -- Create Personal Workspace
    INSERT INTO public.workspaces (name, slug, is_personal, created_by)
    VALUES (workspace_name, 'user-' || new_user_id, true, new_user_id)
    RETURNING id INTO new_workspace_id;

    -- Create Workspace Member
    INSERT INTO public.workspace_members (workspace_id, user_id)
    VALUES (new_workspace_id, new_user_id)
    RETURNING id INTO new_member_id;

    -- Personal workspace owners receive every permission in the catalog.
    INSERT INTO public.workspace_permissions (workspace_member_id, permission_id, assigned_by)
    SELECT new_member_id, id, new_user_id
    FROM public.permissions
    ON CONFLICT DO NOTHING;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'on_auth_user_created failed for user %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$;

-- Attach trigger to auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();

-- 4. RPC: Create Company Workspace
CREATE OR REPLACE FUNCTION public.create_company_workspace(workspace_name TEXT, workspace_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_workspace_id UUID;
    new_member_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Create Workspace
    INSERT INTO public.workspaces (name, slug, is_personal, created_by)
    VALUES (workspace_name, workspace_slug, false, auth.uid())
    RETURNING id INTO new_workspace_id;

    -- Add Creator as Member
    INSERT INTO public.workspace_members (workspace_id, user_id)
    VALUES (new_workspace_id, auth.uid())
    RETURNING id INTO new_member_id;

    -- Company workspace creators receive every permission in the catalog.
    INSERT INTO public.workspace_permissions (workspace_member_id, permission_id, assigned_by)
    SELECT new_member_id, id, auth.uid()
    FROM public.permissions
    ON CONFLICT DO NOTHING;

    RETURN new_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_workspace(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_company_workspace(TEXT, TEXT) TO authenticated;

-- 5. RPC: Accept Workspace Invite
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(invite_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invite_record RECORD;
    new_member_id UUID;
    existing_deleted_at TIMESTAMPTZ;
    perm TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO invite_record
    FROM public.workspace_invites
    WHERE token = invite_token
      AND status = 'pending'
      AND revoked_at IS NULL
      AND expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invite';
    END IF;

    IF lower(invite_record.email) != lower((SELECT email FROM auth.users WHERE id = auth.uid())) THEN
        RAISE EXCEPTION 'Invite email does not match authenticated user';
    END IF;

    IF jsonb_typeof(invite_record.granted_permissions) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invite permissions must be a JSON array';
    END IF;

    -- Prefer an active row if one exists; otherwise restore the most recent
    -- soft-deleted membership. Lock it to prevent concurrent acceptance races.
    SELECT id, deleted_at
    INTO new_member_id, existing_deleted_at
    FROM public.workspace_members
    WHERE workspace_id = invite_record.workspace_id
      AND user_id = auth.uid()
    ORDER BY (deleted_at IS NULL) DESC, joined_at DESC
    LIMIT 1
    FOR UPDATE;
    
    IF new_member_id IS NOT NULL THEN
        IF existing_deleted_at IS NULL THEN
            RAISE EXCEPTION 'User is already an active member of this workspace';
        END IF;

        -- Never restore stale permissions from a previous membership.
        DELETE FROM public.workspace_permissions WHERE workspace_member_id = new_member_id;
        UPDATE public.workspace_members SET deleted_at = NULL, joined_at = NOW() WHERE id = new_member_id;
    ELSE
        -- Add Member
        INSERT INTO public.workspace_members (workspace_id, user_id)
        VALUES (invite_record.workspace_id, auth.uid())
        RETURNING id INTO new_member_id;
    END IF;

    -- Grant Permissions from Invite
    IF invite_record.granted_permissions IS NOT NULL THEN
        FOR perm IN SELECT jsonb_array_elements_text(invite_record.granted_permissions)
        LOOP
            INSERT INTO public.workspace_permissions (workspace_member_id, permission_id, assigned_by)
            SELECT new_member_id, id, invite_record.invited_by
            FROM public.permissions
            WHERE key = perm
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    UPDATE public.workspace_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invite_record.id;

    RETURN invite_record.workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(TEXT) TO authenticated;

-- 6. RPC: Atomically replace a member's permissions
CREATE OR REPLACE FUNCTION public.set_workspace_member_permissions(
    target_member_id UUID,
    permission_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_workspace_id UUID;
    target_user_id UUID;
    normalized_permission_ids UUID[] := COALESCE(permission_ids, ARRAY[]::UUID[]);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT workspace_id, user_id
    INTO target_workspace_id, target_user_id
    FROM public.workspace_members
    WHERE id = target_member_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active workspace member not found';
    END IF;

    IF NOT public.has_workspace_permission(target_workspace_id, 'manage_members') THEN
        RAISE EXCEPTION 'manage_members permission required';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(normalized_permission_ids) requested_permission_id
        LEFT JOIN public.permissions p ON p.id = requested_permission_id
        WHERE p.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Invalid permission id';
    END IF;

    IF target_user_id = auth.uid() AND NOT EXISTS (
        SELECT 1
        FROM public.permissions p
        WHERE p.id = ANY(normalized_permission_ids)
          AND p.key = 'manage_members'
    ) THEN
        RAISE EXCEPTION 'You cannot remove your own manage_members permission';
    END IF;

    DELETE FROM public.workspace_permissions
    WHERE workspace_member_id = target_member_id;

    INSERT INTO public.workspace_permissions (workspace_member_id, permission_id, assigned_by)
    SELECT target_member_id, requested_permission_id, auth.uid()
    FROM (SELECT DISTINCT unnest(normalized_permission_ids) AS requested_permission_id) requested;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_member_permissions(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_workspace_member_permissions(UUID, UUID[]) TO authenticated;

-- 7. RPC: Atomically remove a workspace member and their permissions
CREATE OR REPLACE FUNCTION public.remove_workspace_member(target_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_workspace_id UUID;
    target_user_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT workspace_id, user_id
    INTO target_workspace_id, target_user_id
    FROM public.workspace_members
    WHERE id = target_member_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active workspace member not found';
    END IF;

    IF NOT public.has_workspace_permission(target_workspace_id, 'manage_members') THEN
        RAISE EXCEPTION 'manage_members permission required';
    END IF;
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot remove your own workspace membership';
    END IF;

    DELETE FROM public.workspace_permissions WHERE workspace_member_id = target_member_id;
    UPDATE public.workspace_members
    SET deleted_at = NOW()
    WHERE id = target_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_workspace_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID) TO authenticated;

-- 8. Generic Audit Log Trigger
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    action_name TEXT;
    entity_id UUID;
    ws_id UUID;
    member_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_name := 'created';
        entity_id := NEW.id;
        ws_id := NEW.workspace_id;
    ELSIF TG_OP = 'UPDATE' THEN
        action_name := 'updated';
        entity_id := NEW.id;
        ws_id := NEW.workspace_id;
    ELSIF TG_OP = 'DELETE' THEN
        action_name := 'deleted';
        entity_id := OLD.id;
        ws_id := OLD.workspace_id;
    END IF;

    IF auth.uid() IS NOT NULL AND ws_id IS NOT NULL THEN
        SELECT id INTO member_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND workspace_id = ws_id
          AND deleted_at IS NULL
        LIMIT 1;
        
        INSERT INTO public.activities (
            workspace_id, entity_type, entity_id, actor_type, actor_user_id, workspace_member_id, action
        ) VALUES (
            ws_id, TG_TABLE_NAME, entity_id, 'human', auth.uid(), member_id, action_name
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach Audit Log Triggers
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
