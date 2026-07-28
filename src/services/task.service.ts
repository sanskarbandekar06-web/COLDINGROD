import { createClient } from '@/lib/supabase/server';
import { Task, TaskStatus } from '@/types/task';
import { cache } from 'react';
import { startOfDay, endOfDay, isBefore, isAfter, parseISO } from 'date-fns';

export type DueState = 'overdue' | 'due_today' | 'upcoming' | 'no_date';

export interface GetTasksParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus | 'all';
  assigneeId?: string | 'me' | 'unassigned';
  projectId?: string;
  dueState?: DueState;
  userId?: string; // used for 'me' filter
  sortBy?: 'created_at' | 'updated_at' | 'due_date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedTasks {
  data: (Task & { 
    project?: { name: string } | null,
    assignee?: { full_name: string, avatar_url: string | null } | null
  })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getTasks = cache(async (params: GetTasksParams): Promise<PaginatedTasks> => {
  const supabase = await createClient();
  
  // Base case: If filtering by 'me' but no userId is provided, return empty
  if (params.assigneeId === 'me' && !params.userId) {
    return { data: [], count: 0, page: 1, limit: params.limit || 20, totalPages: 0 };
  }

  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('tasks')
    .select(`
      *,
      project:projects!tasks_project_id_fkey(name),
      assignee:users!tasks_assigned_to_fkey(full_name, avatar_url)
    `, { count: 'exact' })
    .eq('workspace_id', params.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    query = query.ilike('title', `%${params.search}%`);
  }
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }
  
  if (params.assigneeId) {
    if (params.assigneeId === 'me') {
      query = query.eq('assigned_to', params.userId);
    } else if (params.assigneeId === 'unassigned') {
      query = query.is('assigned_to', null);
    } else {
      query = query.eq('assigned_to', params.assigneeId);
    }
  }

  if (params.dueState) {
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();

    switch (params.dueState) {
      case 'overdue':
        // Not completed/cancelled and past today
        query = query
          .lt('due_date', todayStart)
          .not('status', 'in', '("completed","cancelled")');
        break;
      case 'due_today':
        query = query
          .gte('due_date', todayStart)
          .lte('due_date', todayEnd)
          .not('status', 'in', '("completed","cancelled")');
        break;
      case 'upcoming':
        query = query
          .gt('due_date', todayEnd)
          .not('status', 'in', '("completed","cancelled")');
        break;
      case 'no_date':
        query = query.is('due_date', null);
        break;
    }
  }

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  
  if (sortBy === 'due_date') {
    // Nulls last handling for sorting by due date
    query = query.order('due_date', { ascending: sortOrder === 'asc', nullsFirst: false });
  } else {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching tasks:', error);
    throw new Error('Failed to fetch tasks');
  }

  return {
    data: data as any,
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0
  };
});

export const getTaskDetails = cache(async (workspaceId: string, taskId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      project:projects!tasks_project_id_fkey(id, name),
      assignee:users!tasks_assigned_to_fkey(id, full_name, avatar_url)
    `)
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching task details:', error);
    throw new Error('Failed to fetch task details');
  }

  return data;
});
