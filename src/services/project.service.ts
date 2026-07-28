import { createClient } from '@/lib/supabase/server';
import { Project, ProjectStatus } from '@/types/project';
import { cache } from 'react';

export interface GetProjectsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus | 'all';
  ownerId?: string;
  clientId?: string;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProjects {
  data: (Project & { 
    client?: { name: string } | null,
    owner?: { full_name: string } | null,
    taskStats?: { total: number, completed: number }
  })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getProjects = cache(async (params: GetProjectsParams): Promise<PaginatedProjects> => {
  const supabase = await createClient();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('projects')
    .select(`
      *,
      client:clients!projects_client_id_fkey(name),
      owner:users!projects_owner_id_fkey(full_name)
    `, { count: 'exact' })
    .eq('workspace_id', params.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    query = query.ilike('name', `%${params.search}%`);
  }
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.ownerId) {
    query = query.eq('owner_id', params.ownerId);
  }
  if (params.clientId) {
    query = query.eq('client_id', params.clientId);
  }

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching projects:', error);
    throw new Error('Failed to fetch projects');
  }

  // To get progress without N+1
  const projectIds = data.map((p: any) => p.id);
  let taskStats: Record<string, { total: number, completed: number }> = {};
  
  if (projectIds.length > 0) {
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, project_id, status')
      .in('project_id', projectIds)
      .is('deleted_at', null);
      
    if (tasksData) {
      tasksData.forEach(t => {
        if (!taskStats[t.project_id]) taskStats[t.project_id] = { total: 0, completed: 0 };
        taskStats[t.project_id].total++;
        if (t.status === 'completed') taskStats[t.project_id].completed++;
      });
    }
  }

  const enhancedData = data.map((p: any) => ({
    ...p,
    taskStats: taskStats[p.id] || { total: 0, completed: 0 }
  }));

  return {
    data: enhancedData,
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0
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

  // Fetch task stats for progress
  const { data: tasksData } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('project_id', projectId)
    .is('deleted_at', null);
    
  let total = 0;
  let completed = 0;
  if (tasksData) {
    total = tasksData.length;
    completed = tasksData.filter(t => t.status === 'completed').length;
  }

  return {
    ...data,
    taskStats: { total, completed }
  };
});
