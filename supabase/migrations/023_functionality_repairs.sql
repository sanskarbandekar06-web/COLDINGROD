-- ==========================================
-- 023_functionality_repairs.sql
-- ==========================================
-- Safe, auditable note mutation and atomic lead conversion boundaries.

CREATE OR REPLACE FUNCTION public.update_activity_note(
    p_workspace_id UUID,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_activity_id UUID,
    p_content TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    required_permission TEXT;
    normalized_content TEXT := btrim(COALESCE(p_content, ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    required_permission := CASE p_entity_type
        WHEN 'lead' THEN 'manage_leads'
        WHEN 'client' THEN 'manage_clients'
        WHEN 'project' THEN 'manage_projects'
        ELSE NULL
    END;

    IF required_permission IS NULL THEN
        RAISE EXCEPTION 'Unsupported note entity type';
    END IF;

    IF NOT public.has_workspace_permission(p_workspace_id, required_permission) THEN
        RAISE EXCEPTION '% permission required', required_permission;
    END IF;

    IF char_length(normalized_content) < 1 OR char_length(normalized_content) > 5000 THEN
        RAISE EXCEPTION 'Note content must be between 1 and 5000 characters';
    END IF;

    UPDATE public.activities
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'content', normalized_content,
        'edited', true,
        'edited_at', now(),
        'edited_by', auth.uid()
    )
    WHERE id = p_activity_id
      AND workspace_id = p_workspace_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND action = 'note'
      AND actor_type = 'human'
      AND COALESCE((metadata ->> 'deleted')::boolean, false) = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active note not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.redact_activity_note(
    p_workspace_id UUID,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_activity_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    required_permission TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    required_permission := CASE p_entity_type
        WHEN 'lead' THEN 'manage_leads'
        WHEN 'client' THEN 'manage_clients'
        WHEN 'project' THEN 'manage_projects'
        ELSE NULL
    END;

    IF required_permission IS NULL THEN
        RAISE EXCEPTION 'Unsupported note entity type';
    END IF;

    IF NOT public.has_workspace_permission(p_workspace_id, required_permission) THEN
        RAISE EXCEPTION '% permission required', required_permission;
    END IF;

    UPDATE public.activities
    SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'content') || jsonb_build_object(
        'deleted', true,
        'deleted_at', now(),
        'deleted_by', auth.uid()
    )
    WHERE id = p_activity_id
      AND workspace_id = p_workspace_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND action = 'note'
      AND actor_type = 'human'
      AND COALESCE((metadata ->> 'deleted')::boolean, false) = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active note not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_lead_to_client(
    p_workspace_id UUID,
    p_lead_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    source_lead public.leads%ROWTYPE;
    existing_client_id UUID;
    created_client_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.has_workspace_permission(p_workspace_id, 'manage_leads') THEN
        RAISE EXCEPTION 'manage_leads permission required';
    END IF;

    IF NOT public.has_workspace_permission(p_workspace_id, 'manage_clients') THEN
        RAISE EXCEPTION 'manage_clients permission required';
    END IF;

    SELECT *
    INTO source_lead
    FROM public.leads
    WHERE id = p_lead_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active lead not found in workspace';
    END IF;

    SELECT c.id
    INTO existing_client_id
    FROM public.activities a
    JOIN public.clients c
      ON c.id::text = a.metadata ->> 'client_id'
     AND c.workspace_id = p_workspace_id
     AND c.deleted_at IS NULL
    WHERE a.workspace_id = p_workspace_id
      AND a.entity_type = 'lead'
      AND a.entity_id = p_lead_id
      AND a.action = 'converted_to_client'
    ORDER BY a.created_at DESC
    LIMIT 1;

    IF existing_client_id IS NOT NULL THEN
        RETURN existing_client_id;
    END IF;

    INSERT INTO public.clients (workspace_id, name, website, industry)
    VALUES (
        p_workspace_id,
        source_lead.company_name,
        source_lead.website_url,
        source_lead.industry
    )
    RETURNING id INTO created_client_id;

    UPDATE public.leads
    SET status = 'won', updated_at = now()
    WHERE id = p_lead_id
      AND workspace_id = p_workspace_id;

    INSERT INTO public.activities (
        workspace_id,
        entity_type,
        entity_id,
        actor_type,
        actor_user_id,
        action,
        metadata
    ) VALUES (
        p_workspace_id,
        'lead',
        p_lead_id,
        'human',
        auth.uid(),
        'converted_to_client',
        jsonb_build_object('client_id', created_client_id)
    );

    RETURN created_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_activity_note(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redact_activity_note(UUID, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_to_client(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_activity_note(UUID, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redact_activity_note(UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client(UUID, UUID) TO authenticated;
