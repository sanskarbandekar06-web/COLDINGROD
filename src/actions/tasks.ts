'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { TaskStatus } from '@/types/task';

async function checkManageTasksPermission(workspaceId: string) {
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

  return hasJoinedPermission(data.workspace_permissions, ['admin', 'manage_tasks']);
}

export async function createTaskAction(workspaceId: string, projectId: string, _prevState: unknown, formData: FormData) {
  const hasPerm = await checkManageTasksPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied. Must have manage_tasks permission.' };

  const supabase = await createClient();
  
  const title = formData.get('title') as string;
  const assignedToStr = formData.get('assigned_to') as string;
  const assignedTo = assignedToStr === 'unassigned' || !assignedToStr ? null : assignedToStr;
  
  const dueDateStr = formData.get('due_date') as string;
  const dueDate = dueDateStr ? new Date(dueDateStr).toISOString() : null;

  if (!title) return { error: 'Task title is required' };
  
  // Validate project belongs to workspace
  const { data: projData, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .single();
    
  if (projErr || !projData) {
    return { error: 'Invalid project' };
  }

  // Validate assignee is in workspace
  if (assignedTo) {
    const { data: memberData, error: memberErr } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', assignedTo)
      .single();
      
    if (memberErr || !memberData) {
      return { error: 'Assignee is not a valid workspace member' };
    }
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      title,
      assigned_to: assignedTo,
      due_date: dueDate,
      status: 'todo'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return { error: 'Failed to create task' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'task',
      entity_id: task.id,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'task_created',
      metadata: null
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/tasks`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/[projectId]`, 'page');
  return { success: true, taskId: task.id };
}

export async function updateTaskAction(workspaceId: string, taskId: string, _prevState: unknown, formData: FormData) {
  const hasPerm = await checkManageTasksPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const title = formData.get('title') as string;
  const assignedToStr = formData.get('assigned_to') as string;
  const assignedTo = assignedToStr === 'unassigned' || !assignedToStr ? null : assignedToStr;
  
  const dueDateStr = formData.get('due_date') as string;
  const dueDate = dueDateStr ? new Date(dueDateStr).toISOString() : null;

  if (!title) return { error: 'Task title is required' };

  if (assignedTo) {
    const { data: memberData, error: memberErr } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', assignedTo)
      .single();
      
    if (memberErr || !memberData) {
      return { error: 'Assignee is not a valid workspace member' };
    }
  }

  // Get project_id for revalidation
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .single();

  const { error } = await supabase
    .from('tasks')
    .update({ 
      title, 
      assigned_to: assignedTo, 
      due_date: dueDate,
      updated_at: new Date().toISOString() 
    })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('Error updating task:', error);
    return { error: 'Failed to update task' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'task',
      entity_id: taskId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'task_updated',
      metadata: { fields: ['title', 'assigned_to', 'due_date'] }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/tasks`, 'page');
  if (existingTask) {
    revalidatePath(`/dashboard/[workspaceSlug]/projects/${existingTask.project_id}`, 'page');
  }
  return { success: true };
}

export async function updateTaskStatusAction(workspaceId: string, taskId: string, status: TaskStatus) {
  const hasPerm = await checkManageTasksPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .single();
  
  const { error } = await supabase
    .from('tasks')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to update status' };

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'task',
      entity_id: taskId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'status_changed',
      metadata: { status }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/tasks`, 'page');
  if (existingTask) {
    revalidatePath(`/dashboard/[workspaceSlug]/projects/${existingTask.project_id}`, 'page');
  }
  return { success: true };
}

export async function archiveTaskAction(workspaceId: string, taskId: string) {
  const hasPerm = await checkManageTasksPermission(workspaceId);
  if (!hasPerm) return { error: 'Permission denied.' };

  const supabase = await createClient();
  
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .single();
  
  const { error } = await supabase
    .from('tasks')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to archive task' };

  revalidatePath(`/dashboard/[workspaceSlug]/tasks`, 'page');
  if (existingTask) {
    revalidatePath(`/dashboard/[workspaceSlug]/projects/${existingTask.project_id}`, 'page');
  }
  return { success: true };
}
