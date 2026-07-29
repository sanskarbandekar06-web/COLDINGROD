-- ===================================================
-- 010_archived_asset_storage_visibility.sql
-- Keep private objects aligned with asset metadata RLS
-- ===================================================

DROP POLICY IF EXISTS "workspace_assets_select" ON storage.objects;

CREATE POLICY "workspace_assets_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'workspace-assets'
    AND public.is_active_workspace_member(
        public.asset_storage_workspace_id(name)
    )
    AND EXISTS (
        SELECT 1
        FROM public.assets
        WHERE assets.workspace_id = public.asset_storage_workspace_id(storage.objects.name)
          AND assets.file_path = storage.objects.name
    )
);
