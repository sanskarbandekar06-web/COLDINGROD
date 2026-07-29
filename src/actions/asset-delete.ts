'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ASSET_BUCKET } from '@/lib/asset-utils';
import type { AssetActionResult } from '@/types/asset';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Permanent deletion failed.';
}

export async function permanentlyDeleteAssetAction(
  workspaceId: string,
  assetId: string,
): Promise<AssetActionResult> {
  try {
    if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(assetId)) {
      throw new Error('Invalid file identifier.');
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in again.');

    const [{ data: permitted, error: permissionError }, workspaceResult] =
      await Promise.all([
        supabase.rpc('has_workspace_permission', {
          check_workspace_id: workspaceId,
          req_permission: 'manage_assets',
        }),
        supabase
          .from('workspaces')
          .select('slug')
          .eq('id', workspaceId)
          .is('deleted_at', null)
          .maybeSingle(),
      ]);

    if (permissionError) throw new Error('Unable to verify asset permissions.');
    if (permitted !== true) {
      throw new Error('The manage_assets permission is required.');
    }
    if (workspaceResult.error || !workspaceResult.data) {
      throw new Error('Workspace not found.');
    }

    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('file_path')
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .not('deleted_at', 'is', null)
      .maybeSingle();
    if (assetError) throw new Error('Unable to load the archived file.');
    if (!asset) throw new Error('Archived file not found.');

    const { error: storageError } = await supabase.storage
      .from(ASSET_BUCKET)
      .remove([asset.file_path]);
    if (storageError) throw new Error('Failed to remove the stored object.');

    const { error: metadataError } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .not('deleted_at', 'is', null);
    if (metadataError) throw new Error('Failed to remove the file record.');

    revalidatePath(
      `/dashboard/${workspaceResult.data.slug}/assets`,
      'page',
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('Permanent asset deletion error:', error);
    return { success: false, error: errorMessage(error) };
  }
}
