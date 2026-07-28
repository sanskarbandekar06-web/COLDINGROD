'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ProjectStatus } from '@/types/project';

async function checkManageProjectsPermission(workspaceId: string) {
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
  return perms.some(p => p.permissions?.key === 'manage_projects' || p.permissions?.key === 'admin');
}

export async function createProjectAction(workspaceId: string, prevState: any, formData: FormData) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied. Must have manage_projects permission.' };

  const supabase = await createClient();
  
  const name = formData.get('name') as string;
  const clientIdStr = formData.get('client_id') as string;
  const clientId = clientIdStr === 'unassigned' || !clientIdStr ? null : clientIdStr;
  
  const ownerIdStr = formData.get('owner_id') as string;
  const ownerId = ownerIdStr === 'unassigned' || !ownerIdStr ? null : ownerIdStr;

  if (!name) return { error: 'Project Name is required' };

  if (clientId) {
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .single();
    if (clientErr || !clientData) return { error: 'Invalid client' };
  }

  if (ownerId) {
    const { data: ownerData, error: ownerErr } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', ownerId)
      .single();
    if (ownerErr || !ownerData) return { error: 'Owner is not a valid workspace member' };
  }

  // Note: projects schema does not have start_date, due_date, description. We only insert supported fields.
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name,
      client_id: clientId,
      owner_id: ownerId,
      status: 'planning'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return { error: 'Failed to create project' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: project.id,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'project_created',
      metadata: null
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/projects`, 'page');
  return { success: true, projectId: project.id };
}

export async function updateProjectAction(workspaceId: string, projectId: string, prevState: any, formData: FormData) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const name = formData.get('name') as string;
  const clientIdStr = formData.get('client_id') as string;
  const clientId = clientIdStr === 'unassigned' || !clientIdStr ? null : clientIdStr;
  
  const ownerIdStr = formData.get('owner_id') as string;
  const ownerId = ownerIdStr === 'unassigned' || !ownerIdStr ? null : ownerIdStr;

  if (!name) return { error: 'Project Name is required' };

  if (clientId) {
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .single();
    if (clientErr || !clientData) return { error: 'Invalid client' };
  }

  if (ownerId) {
    const { data: ownerData, error: ownerErr } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', ownerId)
      .single();
    if (ownerErr || !ownerData) return { error: 'Owner is not a valid workspace member' };
  }

  const { error } = await supabase
    .from('projects')
    .update({ 
      name, 
      client_id: clientId, 
      owner_id: ownerId, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('Error updating project:', error);
    return { error: 'Failed to update project' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: projectId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'project_updated',
      metadata: { fields: ['name', 'client_id', 'owner_id'] }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/projects`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/[projectId]`, 'page');
  return { success: true };
}

export async function updateProjectStatusAction(workspaceId: string, projectId: string, status: ProjectStatus) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('projects')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to update status' };

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: projectId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'status_changed',
      metadata: { status }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/projects`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/[projectId]`, 'page');
  return { success: true };
}

export async function archiveProjectAction(workspaceId: string, projectId: string) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('projects')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to archive project' };

  revalidatePath(`/dashboard/[workspaceSlug]/projects`, 'page');
  return { success: true };
}

export async function restoreProjectAction(workspaceId: string, projectId: string) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('projects')
    .update({ 
      deleted_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to restore project' };

  revalidatePath(`/dashboard/[workspaceSlug]/projects`, 'page');
  return { success: true };
}

export async function addProjectNoteAction(workspaceId: string, projectId: string, content: string) {
  const hasPerm = await checkManageProjectsPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  if (!content.trim()) return { error: 'Note cannot be empty' };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: 'Unauthenticated' };

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'project',
    entity_id: projectId,
    actor_type: 'human',
    actor_user_id: authData.user.id,
    action: 'note',
    metadata: {
      content,
      edited: false,
      createdFrom: 'project'
    }
  });

  if (error) {
    console.error('Error adding project note:', error);
    return { error: 'Failed to add note' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/projects/[projectId]`, 'page');
  return { success: true };
}
