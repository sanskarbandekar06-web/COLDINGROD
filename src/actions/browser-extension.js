'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createBrowserExtensionConnectionAction(
  workspaceSlug,
  deviceName,
) {
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) {
    return { success: false, error: 'Workspace not found.' };
  }
  if (!context.permissions.includes('manage_integrations')) {
    return {
      success: false,
      error: 'Integration management permission is required.',
    };
  }

  const normalizedName = String(deviceName ?? '').trim();
  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return {
      success: false,
      error: 'Device name must be between 2 and 80 characters.',
    };
  }

  const rawToken = `cgr_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('browser_extension_connections')
    .insert({
      workspace_id: context.workspace.id,
      user_id: context.user.id,
      token_hash: hashToken(rawToken),
      device_name: normalizedName,
      expires_at: expiresAt,
    })
    .select('id, device_name, created_at, expires_at')
    .single();

  if (error || !data) {
    console.error('Browser companion pairing failed:', error?.message);
    return {
      success: false,
      error: 'The pairing key could not be created.',
    };
  }

  revalidatePath(
    `/dashboard/${workspaceSlug}/settings/browser-extension`,
  );

  return {
    success: true,
    connection: data,
    pairingKey: rawToken,
  };
}

export async function revokeBrowserExtensionConnectionAction(
  workspaceSlug,
  connectionId,
) {
  if (!UUID_PATTERN.test(String(connectionId ?? ''))) {
    return { success: false, error: 'Invalid browser connection.' };
  }

  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) {
    return { success: false, error: 'Workspace not found.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('browser_extension_connections')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('workspace_id', context.workspace.id)
    .eq('user_id', context.user.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return {
      success: false,
      error: 'This connection is already revoked or unavailable.',
    };
  }

  revalidatePath(
    `/dashboard/${workspaceSlug}/settings/browser-extension`,
  );
  return { success: true };
}
