'use server';

import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { createClient } from '@/lib/supabase/server';
import type { ProjectStatus } from '@/types/project';

const PROJECT_STATUSES = new Set<ProjectStatus>([
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
]);

function formText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
}

async function checkManageProjectsPermission(workspaceId: string) {
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

  return !error && Boolean(data) && hasJoinedPermission(data.workspace_permissions, ['admin', 'manage_projects']);
}

async function validateProjectRelations(workspaceId: string, clientId: string | null, ownerId: string | null) {
  const supabase = await createClient();

  if (clientId) {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .single();
    if (!data) return 'Client is not active in this workspace.';
  }

  if (ownerId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', ownerId)
      .is('deleted_at', null)
      .single();
    if (!data) return 'Owner is not an active workspace member.';
  }

  return null;
}

function projectFormValues(formData: FormData) {
  const clientValue = String(formData.get('client_id') ?? '');
  const ownerValue = String(formData.get('owner_id') ?? '');
  return {
    name: formText(formData, 'name', 200),
    description: formText(formData, 'description', 2000),
    clientId: clientValue && clientValue !== 'unassigned' ? clientValue : null,
    ownerId: ownerValue && ownerValue !== 'unassigned' ? ownerValue : null,
  };
}

export async function createProjectAction(workspaceId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageProjectsPermission(workspaceId))) {
    return { error: 'Permission denied. Must have manage_projects permission.' };
  }

  const values = projectFormValues(formData);
  if (!values.name) return { error: 'Project name is required.' };
  const relationError = await validateProjectRelations(workspaceId, values.clientId, values.ownerId);
  if (relationError) return { error: relationError };

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name: values.name,
      description: values.description,
      client_id: values.clientId,
      owner_id: values.ownerId,
      status: 'planning',
    })
    .select('id')
    .single();

  if (error || !project) {
    console.error('Error creating project:', error);
    return { error: 'Failed to create project.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: project.id,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'project_created',
      metadata: null,
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/projects', 'page');
  return { success: true, projectId: project.id };
}

export async function updateProjectAction(workspaceId: string, projectId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageProjectsPermission(workspaceId))) return { error: 'Permission denied.' };

  const values = projectFormValues(formData);
  if (!values.name) return { error: 'Project name is required.' };
  const relationError = await validateProjectRelations(workspaceId, values.clientId, values.ownerId);
  if (relationError) return { error: relationError };

  const supabase = await createClient();
  const { data: updatedProject, error } = await supabase
    .from('projects')
    .update({
      name: values.name,
      description: values.description,
      client_id: values.clientId,
      owner_id: values.ownerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !updatedProject) {
    console.error('Error updating project:', error);
    return { error: 'Project not found or could not be updated.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: projectId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'project_updated',
      metadata: { fields: ['name', 'description', 'client_id', 'owner_id'] },
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/projects', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/projects/[projectId]', 'page');
  return { success: true };
}

export async function updateProjectStatusAction(workspaceId: string, projectId: string, status: ProjectStatus) {
  if (!(await checkManageProjectsPermission(workspaceId))) return { error: 'Permission denied.' };
  if (!PROJECT_STATUSES.has(status)) return { error: 'Invalid project status.' };

  const supabase = await createClient();
  const { data: updatedProject, error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !updatedProject) return { error: 'Project not found or status could not be updated.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'project',
      entity_id: projectId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'status_changed',
      metadata: { status },
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/projects', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/projects/[projectId]', 'page');
  return { success: true };
}

export async function archiveProjectAction(workspaceId: string, projectId: string) {
  if (!(await checkManageProjectsPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Project not found or could not be archived.' };

  revalidatePath('/dashboard/[workspaceSlug]/projects', 'page');
  return { success: true };
}

export async function restoreProjectAction(workspaceId: string, projectId: string) {
  if (!(await checkManageProjectsPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Project not found or could not be restored.' };

  revalidatePath('/dashboard/[workspaceSlug]/projects', 'page');
  return { success: true };
}

export async function addProjectNoteAction(workspaceId: string, projectId: string, content: string) {
  if (!(await checkManageProjectsPermission(workspaceId))) return { error: 'Permission denied.' };

  const normalizedContent = content.trim();
  if (!normalizedContent || normalizedContent.length > 5000) {
    return { error: 'Note content must be between 1 and 5000 characters.' };
  }

  const supabase = await createClient();
  const [{ data: project }, { data: authData }] = await Promise.all([
    supabase.from('projects').select('id').eq('id', projectId).eq('workspace_id', workspaceId).is('deleted_at', null).single(),
    supabase.auth.getUser(),
  ]);
  if (!project) return { error: 'Active project not found.' };
  if (!authData.user) return { error: 'Authentication required.' };

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'project',
    entity_id: projectId,
    actor_type: 'human',
    actor_user_id: authData.user.id,
    action: 'note',
    metadata: { content: normalizedContent, edited: false, createdFrom: 'project' },
  });

  if (error) {
    console.error('Error adding project note:', error);
    return { error: 'Failed to add note.' };
  }

  revalidatePath('/dashboard/[workspaceSlug]/projects/[projectId]', 'page');
  return { success: true };
}
