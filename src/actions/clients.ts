'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

async function checkManageClientsPermission(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      workspace_permissions (
        permissions ( key )
      )
    `)
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return false;

  const perms = (data.workspace_permissions as any[]) || [];
  return perms.some(p => p.permissions?.key === 'manage_clients' || p.permissions?.key === 'admin');
}

export async function createClientAction(workspaceId: string, prevState: any, formData: FormData) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied. Must have manage_clients permission.' };

  const supabase = await createClient();
  
  const name = formData.get('name') as string;
  const website = formData.get('website') as string || null;
  const industry = formData.get('industry') as string || null;
  
  if (!name) return { error: 'Company Name is required' };

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      workspace_id: workspaceId,
      name,
      website,
      industry
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating client:', error);
    return { error: 'Failed to create client' };
  }

  // Log activity
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'client',
      entity_id: client.id,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'client_created',
      metadata: null
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/clients`, 'page');
  return { success: true, clientId: client.id };
}

export async function updateClientAction(workspaceId: string, clientId: string, prevState: any, formData: FormData) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const name = formData.get('name') as string;
  const website = formData.get('website') as string || null;
  const industry = formData.get('industry') as string || null;

  if (!name) return { error: 'Company Name is required' };

  const { error } = await supabase
    .from('clients')
    .update({ name, website, industry, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('Error updating client:', error);
    return { error: 'Failed to update client' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'client',
      entity_id: clientId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'client_updated',
      metadata: { fields: ['name', 'website', 'industry'] }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/clients`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}

export async function archiveClientAction(workspaceId: string, clientId: string) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('clients')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to archive client' };

  revalidatePath(`/dashboard/[workspaceSlug]/clients`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}

export async function restoreClientAction(workspaceId: string, clientId: string) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('clients')
    .update({ 
      deleted_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to restore client' };

  revalidatePath(`/dashboard/[workspaceSlug]/clients`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}

export async function addClientNoteAction(workspaceId: string, clientId: string, content: string) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  if (!content.trim()) return { error: 'Note cannot be empty' };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: 'Unauthenticated' };

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'client',
    entity_id: clientId,
    actor_type: 'human',
    actor_user_id: authData.user.id,
    action: 'note',
    metadata: {
      content,
      edited: false,
      createdFrom: 'client'
    }
  });

  if (error) {
    console.error('Error adding client note:', error);
    return { error: 'Failed to add note' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}

export async function updateClientNoteAction(workspaceId: string, clientId: string, activityId: string, content: string) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  if (!content.trim()) return { error: 'Note cannot be empty' };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: 'Unauthenticated' };

  const { error } = await supabase
    .from('activities')
    .update({
      metadata: {
        content,
        edited: true,
        createdFrom: 'client',
        edited_at: new Date().toISOString()
      }
    })
    .eq('id', activityId)
    .eq('workspace_id', workspaceId)
    .eq('entity_id', clientId)
    .eq('action', 'note')
    .eq('actor_user_id', authData.user.id); // Only author can edit usually, or admin. We'll enforce author.

  if (error) {
    console.error('Error updating client note:', error);
    return { error: 'Failed to update note' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}

export async function deleteClientNoteAction(workspaceId: string, clientId: string, activityId: string) {
  const hasPerm = await checkManageClientsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .eq('workspace_id', workspaceId)
    .eq('entity_id', clientId)
    .eq('action', 'note');

  if (error) {
    console.error('Error deleting client note:', error);
    return { error: 'Failed to delete note' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/clients/[clientId]`, 'page');
  return { success: true };
}
