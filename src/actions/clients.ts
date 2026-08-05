'use server';

import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { createClient } from '@/lib/supabase/server';

function normalizeText(value: FormDataEntryValue | null, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
}

function normalizeWebsite(value: FormDataEntryValue | null) {
  const website = normalizeText(value, 500);
  if (!website) return { value: null };

  try {
    const parsed = new URL(website);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Website must use http:// or https://.' };
    }
    return { value: parsed.toString() };
  } catch {
    return { error: 'Enter a valid website URL including https://.' };
  }
}

async function checkManageClientsPermission(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_permissions(permissions(key))')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  return !error && Boolean(data) && hasJoinedPermission(data.workspace_permissions, ['admin', 'manage_clients']);
}

export async function createClientAction(workspaceId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageClientsPermission(workspaceId))) {
    return { error: 'Permission denied. Must have manage_clients permission.' };
  }

  const name = normalizeText(formData.get('name'), 200);
  const websiteResult = normalizeWebsite(formData.get('website'));
  const industry = normalizeText(formData.get('industry'), 160);

  if (!name) return { error: 'Company name is required.' };
  if (websiteResult.error) return { error: websiteResult.error };

  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from('clients')
    .insert({ workspace_id: workspaceId, name, website: websiteResult.value, industry })
    .select('id')
    .single();

  if (error || !client) {
    console.error('Error creating client:', error);
    return { error: 'Failed to create client.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'client',
      entity_id: client.id,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'client_created',
      metadata: null,
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/clients', 'page');
  return { success: true, clientId: client.id };
}

export async function updateClientAction(workspaceId: string, clientId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageClientsPermission(workspaceId))) return { error: 'Permission denied.' };

  const name = normalizeText(formData.get('name'), 200);
  const websiteResult = normalizeWebsite(formData.get('website'));
  const industry = normalizeText(formData.get('industry'), 160);

  if (!name) return { error: 'Company name is required.' };
  if (websiteResult.error) return { error: websiteResult.error };

  const supabase = await createClient();
  const { data: updatedClient, error } = await supabase
    .from('clients')
    .update({ name, website: websiteResult.value, industry, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !updatedClient) {
    console.error('Error updating client:', error);
    return { error: 'Client not found or could not be updated.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'client',
      entity_id: clientId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'client_updated',
      metadata: { fields: ['name', 'website', 'industry'] },
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/clients', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/clients/[clientId]', 'page');
  return { success: true };
}

export async function archiveClientAction(workspaceId: string, clientId: string) {
  if (!(await checkManageClientsPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Client not found or could not be archived.' };

  revalidatePath('/dashboard/[workspaceSlug]/clients', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/clients/[clientId]', 'page');
  return { success: true };
}

export async function restoreClientAction(workspaceId: string, clientId: string) {
  if (!(await checkManageClientsPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Client not found or could not be restored.' };

  revalidatePath('/dashboard/[workspaceSlug]/clients', 'page');
  return { success: true };
}

export async function addClientNoteAction(workspaceId: string, clientId: string, content: string) {
  if (!(await checkManageClientsPermission(workspaceId))) return { error: 'Permission denied.' };

  const normalizedContent = content.trim();
  if (!normalizedContent || normalizedContent.length > 5000) {
    return { error: 'Note content must be between 1 and 5000 characters.' };
  }

  const supabase = await createClient();
  const [{ data: client }, { data: authData }] = await Promise.all([
    supabase.from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).is('deleted_at', null).single(),
    supabase.auth.getUser(),
  ]);
  if (!client) return { error: 'Active client not found.' };
  if (!authData.user) return { error: 'Authentication required.' };

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'client',
    entity_id: clientId,
    actor_type: 'human',
    actor_user_id: authData.user.id,
    action: 'note',
    metadata: { content: normalizedContent, edited: false, createdFrom: 'client' },
  });

  if (error) {
    console.error('Error adding client note:', error);
    return { error: 'Failed to add note.' };
  }

  revalidatePath('/dashboard/[workspaceSlug]/clients/[clientId]', 'page');
  return { success: true };
}

export async function updateClientNoteAction(workspaceId: string, clientId: string, activityId: string, content: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_activity_note', {
    p_workspace_id: workspaceId,
    p_entity_type: 'client',
    p_entity_id: clientId,
    p_activity_id: activityId,
    p_content: content,
  });

  if (error) {
    console.error('Error updating client note:', error);
    return { error: error.message || 'Failed to update note.' };
  }

  revalidatePath('/dashboard/[workspaceSlug]/clients/[clientId]', 'page');
  return { success: true };
}

export async function deleteClientNoteAction(workspaceId: string, clientId: string, activityId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('redact_activity_note', {
    p_workspace_id: workspaceId,
    p_entity_type: 'client',
    p_entity_id: clientId,
    p_activity_id: activityId,
  });

  if (error) {
    console.error('Error redacting client note:', error);
    return { error: error.message || 'Failed to delete note.' };
  }

  revalidatePath('/dashboard/[workspaceSlug]/clients/[clientId]', 'page');
  return { success: true };
}
