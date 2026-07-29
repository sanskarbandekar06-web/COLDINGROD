-- ==========================================
-- 009_assets_file_manager_storage.sql
-- Phase 2.9: private workspace asset storage
-- ==========================================

ALTER TABLE public.assets
    ADD COLUMN upload_source public.asset_upload_source NOT NULL DEFAULT 'general',
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.assets
    ADD CONSTRAINT assets_name_not_blank CHECK (char_length(btrim(name)) BETWEEN 1 AND 255),
    ADD CONSTRAINT assets_file_path_not_blank CHECK (char_length(btrim(file_path)) > 0),
    ADD CONSTRAINT assets_file_type_not_blank CHECK (char_length(btrim(file_type)) > 0),
    ADD CONSTRAINT assets_size_bounds CHECK (size_bytes BETWEEN 0 AND 26214400);

CREATE UNIQUE INDEX idx_assets_file_path_unique
    ON public.assets(file_path);

CREATE INDEX idx_assets_workspace_source
    ON public.assets(workspace_id, upload_source, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_assets
    BEFORE UPDATE ON public.assets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER POLICY "assets_select" ON public.assets
USING (
    public.is_active_workspace_member(workspace_id)
    AND (
        deleted_at IS NULL
        OR public.has_workspace_permission(workspace_id, 'manage_assets')
    )
);

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'workspace-assets',
    'workspace-assets',
    FALSE,
    26214400,
    ARRAY[
        'image/*',
        'video/*',
        'audio/*',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/json',
        'application/zip',
        'application/x-zip-compressed',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.asset_storage_workspace_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    folders TEXT[];
    workspace_segment TEXT;
BEGIN
    folders := storage.foldername(object_name);
    workspace_segment := folders[1];

    IF workspace_segment IS NULL OR workspace_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN NULL;
    END IF;

    RETURN workspace_segment::UUID;
END;
$$;

REVOKE ALL ON FUNCTION public.asset_storage_workspace_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asset_storage_workspace_id(TEXT) TO authenticated;

DROP POLICY IF EXISTS "workspace_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "workspace_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "workspace_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "workspace_assets_delete" ON storage.objects;

CREATE POLICY "workspace_assets_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'workspace-assets'
    AND public.is_active_workspace_member(public.asset_storage_workspace_id(name))
);

CREATE POLICY "workspace_assets_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'workspace-assets'
    AND public.has_workspace_permission(
        public.asset_storage_workspace_id(name),
        'manage_assets'
    )
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::TEXT
);

CREATE POLICY "workspace_assets_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'workspace-assets'
    AND public.has_workspace_permission(
        public.asset_storage_workspace_id(name),
        'manage_assets'
    )
)
WITH CHECK (
    bucket_id = 'workspace-assets'
    AND public.has_workspace_permission(
        public.asset_storage_workspace_id(name),
        'manage_assets'
    )
);

CREATE POLICY "workspace_assets_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'workspace-assets'
    AND public.has_workspace_permission(
        public.asset_storage_workspace_id(name),
        'manage_assets'
    )
);
