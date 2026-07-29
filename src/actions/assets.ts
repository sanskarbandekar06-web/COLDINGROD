'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ASSET_UPLOAD_SOURCES,
  type AssetActionResult,
  type AssetUploadSource,
  type CreateAssetRecordInput,
} from '@/types/asset';
import {
  MAX_ASSET_FILE_SIZE_BYTES,
  isAllowedAssetMimeType,
} from '@/lib/asset-utils';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface AssetManager {
  userId: string;
  workspaceSlug: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RELATED_ENTITY_TABLES = {
  client: 'clients',
  lead: 'leads',
  project: 'projects',
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isUploadSource(value: string): value is AssetUploadSource {
  return ASSET_UPLOAD_SOURCES.some((source) => source === value);
}

function validateUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
}

async function requireAssetManager(
  supabase: SupabaseServerClient,
  workspaceId: string,
): Promise<AssetManager> {
  validateUuid(workspaceId, 'Workspace');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Please sign in again.');

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

  return {
    userId: user.id,
    workspaceSlug: workspaceResult.data.slug,
  };
}

async function validateRelatedEntity(
  supabase: SupabaseServerClient,
  workspaceId: string,
  source: AssetUploadSource,
  entityId: string | null,
): Promise<{ entityType: string | null; entityId: string | null }> {
  if (!(source in RELATED_ENTITY_TABLES)) {
    return { entityType: null, entityId: null };
  }
  if (!entityId) {
    throw new Error(`Choose a ${source} for this file.`);
  }
  validateUuid(entityId, 'Related record');

  const table =
    RELATED_ENTITY_TABLES[source as keyof typeof RELATED_ENTITY_TABLES];
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify the selected ${source}.`);
  if (!data) throw new Error(`The selected ${source} is not available.`);

  return { entityType: source, entityId };
}

function revalidateAssets(workspaceSlug: string): void {
  revalidatePath(`/dashboard/${workspaceSlug}/assets`, 'page');
}

export async function createAssetRecordAction(
  input: CreateAssetRecordInput,
): Promise<AssetActionResult> {
  try {
    const supabase = await createClient();
    const manager = await requireAssetManager(supabase, input.workspaceId);
    const name = input.name.trim();
    const filePath = input.filePath.trim();
    const fileType = input.fileType.trim().toLowerCase();

    if (!name || name.length > 255) {
      throw new Error('File name must be between 1 and 255 characters.');
    }
    if (
      !filePath ||
      filePath.length > 1024 ||
      filePath.includes('..') ||
      !filePath.startsWith(`${input.workspaceId}/${manager.userId}/`)
    ) {
      throw new Error('The uploaded file path is invalid.');
    }
    if (!isAllowedAssetMimeType(fileType)) {
      throw new Error('This file type is not allowed.');
    }
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes < 0 ||
      input.sizeBytes > MAX_ASSET_FILE_SIZE_BYTES
    ) {
      throw new Error('File size must be 25 MB or smaller.');
    }
    if (!isUploadSource(input.uploadSource)) {
      throw new Error('Upload source is invalid.');
    }

    const relation = await validateRelatedEntity(
      supabase,
      input.workspaceId,
      input.uploadSource,
      input.entityId ?? null,
    );
    const { data, error } = await supabase
      .from('assets')
      .insert({
        workspace_id: input.workspaceId,
        name,
        file_path: filePath,
        file_type: fileType,
        size_bytes: input.sizeBytes,
        upload_source: input.uploadSource,
        entity_type: relation.entityType,
        entity_id: relation.entityId,
        uploaded_by: manager.userId,
        metadata: { original_name: name },
      })
      .select('id')
      .single();

    if (error || !data) throw new Error('Failed to save the file record.');

    revalidateAssets(manager.workspaceSlug);
    return { success: true, assetId: data.id };
  } catch (error: unknown) {
    console.error('Create asset record error:', error);
    return { success: false, error: errorMessage(error, 'Upload failed.') };
  }
}

export async function renameAssetAction(
  workspaceId: string,
  assetId: string,
  newName: string,
): Promise<AssetActionResult> {
  try {
    validateUuid(assetId, 'Asset');
    const name = newName.trim();
    if (!name || name.length > 255) {
      throw new Error('File name must be between 1 and 255 characters.');
    }

    const supabase = await createClient();
    const manager = await requireAssetManager(supabase, workspaceId);
    const { data, error } = await supabase
      .from('assets')
      .update({ name })
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw new Error('Failed to rename the file.');
    if (!data) throw new Error('File not found.');

    revalidateAssets(manager.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Rename asset error:', error);
    return { success: false, error: errorMessage(error, 'Rename failed.') };
  }
}

export async function archiveAssetAction(
  workspaceId: string,
  assetId: string,
): Promise<AssetActionResult> {
  try {
    validateUuid(assetId, 'Asset');
    const supabase = await createClient();
    const manager = await requireAssetManager(supabase, workspaceId);
    const { data, error } = await supabase
      .from('assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw new Error('Failed to archive the file.');
    if (!data) throw new Error('File not found.');

    revalidateAssets(manager.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Archive asset error:', error);
    return { success: false, error: errorMessage(error, 'Archive failed.') };
  }
}

export async function restoreAssetAction(
  workspaceId: string,
  assetId: string,
): Promise<AssetActionResult> {
  try {
    validateUuid(assetId, 'Asset');
    const supabase = await createClient();
    const manager = await requireAssetManager(supabase, workspaceId);
    const { data, error } = await supabase
      .from('assets')
      .update({ deleted_at: null })
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();

    if (error) throw new Error('Failed to restore the file.');
    if (!data) throw new Error('Archived file not found.');

    revalidateAssets(manager.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Restore asset error:', error);
    return { success: false, error: errorMessage(error, 'Restore failed.') };
  }
}
