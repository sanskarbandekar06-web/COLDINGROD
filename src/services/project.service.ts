import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Project, ProjectStatus } from '@/types/project';

export interface GetProjectsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus | 'all';
  ownerId?: string;
  clientId?: string;
  archived?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProjects {
  data: (Project & {
    client?: { name: string } | null;
    owner?: { full_name: string } | null;
    taskStats?: { total: number; completed: number };
  })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getProjects = cache(async (params: GetProjectsParams): Promise<PaginatedProjects> => {
  const supabase = await createClient();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(1000, Math.max(1, params.limit || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('projects')
    .select(`
      *,
      client:clients!projects_client_id_fkey(name),
      owner:users!projects_owner_id_fkey(full_name)
    `, { count: 'exact' })
    .eq('workspace_id', params.workspaceId);

  query = params.archived
    ? query.not('deleted_at', 'is', null)
    : query.is('deleted_at', null);

  if (params.search) query = query.ilike('name', `%${params.search}%`);
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.clientId) query = query.eq('client_id', params.clientId);

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error('Error fetching projects:', error);
    throw new Error('Failed to fetch projects');
  }

  const projects = data as unknown as PaginatedProjects['data'];
  const projectIds = projects.map((project) => project.id);
  const taskStats: Record<string, { total: number; completed: number }> = {};

  if (projectIds.length > 0) {
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, project_id, status')
      .eq('workspace_id', params.workspaceId)
      .in('project_id', projectIds)
      .is('deleted_at', null);

    for (const task of tasksData || []) {
      taskStats[task.project_id] ||= { total: 0, completed: 0 };
      taskStats[task.project_id].total += 1;
      if (task.status === 'completed') taskStats[task.project_id].completed += 1;
    }
  }

  return {
    data: projects.map((project) => ({
      ...project,
      taskStats: taskStats[project.id] || { total: 0, completed: 0 },
    })),
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

export const getProjectDetails = cache(async (workspaceId: string, projectId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      client:clients!projects_client_id_fkey(id, name),
      owner:users!projects_owner_id_fkey(id, full_name, avatar_url)
    `)
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching project details:', error);
    throw new Error('Failed to fetch project details');
  }

  const { data: tasksData } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('deleted_at', null);

  return {
    ...data,
    taskStats: {
      total: tasksData?.length || 0,
      completed: tasksData?.filter((task) => task.status === 'completed').length || 0,
    },
  };
});
