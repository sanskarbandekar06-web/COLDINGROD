-- Repair legacy workspace slugs and enforce route-safe values.

DO $migration$
DECLARE
    workspace_record RECORD;
    base_slug TEXT;
    candidate_slug TEXT;
    candidate_suffix TEXT;
    candidate_number INTEGER;
BEGIN
    FOR workspace_record IN
        SELECT id, name, deleted_at
        FROM public.workspaces
        WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
           OR char_length(slug) NOT BETWEEN 2 AND 63
        ORDER BY created_at, id
    LOOP
        base_slug := lower(workspace_record.name);
        base_slug := regexp_replace(base_slug, '[''’]', '', 'g');
        base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
        base_slug := trim(BOTH '-' FROM base_slug);
        base_slug := left(base_slug, 63);
        base_slug := trim(TRAILING '-' FROM base_slug);

        IF char_length(base_slug) < 2 THEN
            base_slug := 'workspace-' || left(workspace_record.id::TEXT, 8);
        END IF;

        candidate_slug := base_slug;
        candidate_number := 2;

        IF workspace_record.deleted_at IS NULL THEN
            WHILE EXISTS (
                SELECT 1
                FROM public.workspaces existing_workspace
                WHERE existing_workspace.id <> workspace_record.id
                  AND existing_workspace.deleted_at IS NULL
                  AND existing_workspace.slug = candidate_slug
            ) LOOP
                candidate_suffix := '-' || candidate_number::TEXT;
                candidate_slug :=
                    left(base_slug, 63 - char_length(candidate_suffix)) ||
                    candidate_suffix;
                candidate_number := candidate_number + 1;
            END LOOP;
        END IF;

        UPDATE public.workspaces
        SET slug = candidate_slug
        WHERE id = workspace_record.id;
    END LOOP;
END;
$migration$;

ALTER TABLE public.workspaces
    DROP CONSTRAINT IF EXISTS workspaces_slug_format_check;

ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_slug_format_check
    CHECK (
        char_length(slug) BETWEEN 2 AND 63
        AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    );

CREATE OR REPLACE FUNCTION public.create_company_workspace(
    workspace_name TEXT,
    workspace_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    new_workspace_id UUID;
    new_member_id UUID;
    normalized_workspace_name TEXT := btrim(workspace_name);
    normalized_workspace_slug TEXT := lower(btrim(workspace_slug));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF normalized_workspace_name = ''
       OR char_length(normalized_workspace_name) > 100 THEN
        RAISE EXCEPTION 'Workspace name must be between 1 and 100 characters'
            USING ERRCODE = '22023';
    END IF;

    IF char_length(normalized_workspace_slug) NOT BETWEEN 2 AND 63
       OR normalized_workspace_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
        RAISE EXCEPTION
            'Workspace slug must use 2-63 lowercase letters, numbers, or hyphens'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspaces (name, slug, is_personal, created_by)
    VALUES (
        normalized_workspace_name,
        normalized_workspace_slug,
        false,
        auth.uid()
    )
    RETURNING id INTO new_workspace_id;

    INSERT INTO public.workspace_members (workspace_id, user_id)
    VALUES (new_workspace_id, auth.uid())
    RETURNING id INTO new_member_id;

    INSERT INTO public.workspace_permissions (
        workspace_member_id,
        permission_id,
        assigned_by
    )
    SELECT new_member_id, id, auth.uid()
    FROM public.permissions
    ON CONFLICT DO NOTHING;

    RETURN new_workspace_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_company_workspace(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_company_workspace(TEXT, TEXT)
    TO authenticated;
