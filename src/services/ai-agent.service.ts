import { createClient } from '@/lib/supabase/server';
import { AiAgent } from '@/types/ai';
import { cache } from 'react';

export interface GetAgentsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedAgents {
  data: (Omit<AiAgent, 'system_prompt'> & { recentActionCount?: number })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getAgents = cache(async (params: GetAgentsParams): Promise<PaginatedAgents> => {
  const supabase = await createClient();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // system_prompt deliberately excluded from this query — never needed for list views
  let query = supabase
    .from('ai_agents')
    .select(
      'id, workspace_id, name, description, model, created_at, updated_at, deleted_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .or(`workspace_id.eq.${params.workspaceId},workspace_id.is.null`);

  if (params.search) {
    query = query.ilike('name', `%${params.search}%`);
  }

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching agents:', error.message);
    throw new Error('Failed to fetch agents');
  }

  // Batch fetch action counts for this workspace — scoped to workspaceId only
  const agentIds = data.map((a: Omit<AiAgent, 'system_prompt'>) => a.id);
  const actionCounts: Record<string, number> = {};

  if (agentIds.length > 0) {
    const { data: actionsData } = await supabase
      .from('ai_actions')
      .select('agent_id')
      .eq('workspace_id', params.workspaceId) // Scoped to current workspace only
      .in('agent_id', agentIds)
      .is('deleted_at', null);

    if (actionsData) {
      actionsData.forEach((a: { agent_id: string | null }) => {
        if (a.agent_id) {
          actionCounts[a.agent_id] = (actionCounts[a.agent_id] || 0) + 1;
        }
      });
    }
  }

  return {
    data: data.map((agent: Omit<AiAgent, 'system_prompt'>) => ({
      ...agent,
      recentActionCount: actionCounts[agent.id] || 0,
    })),
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

export const getAgentDetails = cache(async (workspaceId: string, agentId: string) => {
  const supabase = await createClient();

  // system_prompt deliberately excluded from this query — never needed for UI
  const { data, error } = await supabase
    .from('ai_agents')
    .select('id, workspace_id, name, description, model, created_at, updated_at, deleted_at')
    .eq('id', agentId)
    // Workspace isolation: accept workspace-owned OR system-wide (workspace_id IS NULL)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching agent details:', error.message);
    throw new Error('Failed to fetch agent details');
  }

  return data as Omit<AiAgent, 'system_prompt'>;
});
