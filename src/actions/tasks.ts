'use server';

import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { createClient } from '@/lib/supabase/server';
import type { TaskStatus } from '@/types/task';

const TASK_STATUSES = new Set<TaskStatus>([
  'todo',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
]);

async function checkManageTasksPermission(workspaceId: string) {
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

  return !error && Boolean(data) && hasJoinedPermission(data.workspace_permissions, ['admin', 'manage_tasks']);
}

function taskFormValues(formData: FormData) {
  const titleValue = formData.get('title');
  const title = typeof titleValue === 'string' ? titleValue.trim().slice(0, 300) : '';
  const assignedValue = String(formData.get('assigned_to') ?? '');
  const assignedTo = assignedValue && assignedValue !== 'unassigned' ? assignedValue : null;
  const dueValue = String(formData.get('due_date') ?? '').trim();

  if (!dueValue) return { title, assignedTo, dueDate: null, dateError: null };
  const parsed = new Date(`${dueValue}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { title, assignedTo, dueDate: null, dateError: 'Enter a valid due date.' };
  }

  return { title, assignedTo, dueDate: parsed.toISOString(), dateError: null };
}

async function validateAssignee(workspaceId: string, assignedTo: string | null) {
  if (!assignedTo) return true;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', assignedTo)
    .is('deleted_at', null)
    .single();
  return !error && Boolean(data);
}

async function logTaskActivity(workspaceId: string, taskId: string, action: string, metadata: Record<string, unknown> | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'task',
    entity_id: taskId,
    actor_type: 'human',
    actor_user_id: user.id,
    action,
    metadata,
  });
}

export async function createTaskAction(workspaceId: string, projectId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageTasksPermission(workspaceId))) {
    return { error: 'Permission denied. Must have manage_tasks permission.' };
  }

  const values = taskFormValues(formData);
  if (!values.title) return { error: 'Task title is required.' };
  if (values.dateError) return { error: values.dateError };
  if (!(await validateAssignee(workspaceId, values.assignedTo))) {
    return { error: 'Assignee is not an active workspace member.' };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();
  if (!project) return { error: 'Project is not active in this workspace.' };

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      title: values.title,
      assigned_to: values.assignedTo,
      due_date: values.dueDate,
      status: 'todo',
    })
    .select('id')
    .single();

  if (error || !task) {
    console.error('Error creating task:', error);
    return { error: 'Failed to create task.' };
  }

  await logTaskActivity(workspaceId, task.id, 'task_created', null);
  revalidatePath('/dashboard/[workspaceSlug]/tasks', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/projects/[projectId]', 'page');
  return { success: true, taskId: task.id };
}

export async function updateTaskAction(workspaceId: string, taskId: string, _prevState: unknown, formData: FormData) {
  if (!(await checkManageTasksPermission(workspaceId))) return { error: 'Permission denied.' };

  const values = taskFormValues(formData);
  if (!values.title) return { error: 'Task title is required.' };
  if (values.dateError) return { error: values.dateError };
  if (!(await validateAssignee(workspaceId, values.assignedTo))) {
    return { error: 'Assignee is not an active workspace member.' };
  }

  const supabase = await createClient();
  const { data: updatedTask, error } = await supabase
    .from('tasks')
    .update({
      title: values.title,
      assigned_to: values.assignedTo,
      due_date: values.dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id, project_id')
    .single();

  if (error || !updatedTask) {
    console.error('Error updating task:', error);
    return { error: 'Task not found or could not be updated.' };
  }

  await logTaskActivity(workspaceId, taskId, 'task_updated', { fields: ['title', 'assigned_to', 'due_date'] });
  revalidatePath('/dashboard/[workspaceSlug]/tasks', 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/${updatedTask.project_id}`, 'page');
  return { success: true };
}

export async function updateTaskStatusAction(workspaceId: string, taskId: string, status: TaskStatus) {
  if (!(await checkManageTasksPermission(workspaceId))) return { error: 'Permission denied.' };
  if (!TASK_STATUSES.has(status)) return { error: 'Invalid task status.' };

  const supabase = await createClient();
  const { data: updatedTask, error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id, project_id')
    .single();

  if (error || !updatedTask) return { error: 'Task not found or status could not be updated.' };

  await logTaskActivity(workspaceId, taskId, 'status_changed', { status });
  revalidatePath('/dashboard/[workspaceSlug]/tasks', 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/${updatedTask.project_id}`, 'page');
  return { success: true };
}

export async function archiveTaskAction(workspaceId: string, taskId: string) {
  if (!(await checkManageTasksPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data: archivedTask, error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id, project_id')
    .single();

  if (error || !archivedTask) return { error: 'Task not found or could not be archived.' };

  await logTaskActivity(workspaceId, taskId, 'task_archived', null);
  revalidatePath('/dashboard/[workspaceSlug]/tasks', 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/${archivedTask.project_id}`, 'page');
  return { success: true };
}

export async function restoreTaskAction(workspaceId: string, taskId: string) {
  if (!(await checkManageTasksPermission(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('id, project_id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .single();
  if (!task) return { error: 'Archived task not found.' };

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', task.project_id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();
  if (!project) return { error: 'Restore the task project before restoring this task.' };

  const { data: restoredTask, error } = await supabase
    .from('tasks')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single();

  if (error || !restoredTask) return { error: 'Task could not be restored.' };

  await logTaskActivity(workspaceId, taskId, 'task_restored', null);
  revalidatePath('/dashboard/[workspaceSlug]/tasks', 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/projects/${task.project_id}`, 'page');
  return { success: true };
}
