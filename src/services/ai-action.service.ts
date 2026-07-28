import { createClient } from '@/lib/supabase/server';
import { AiAction, AiActionStatus } from '@/types/ai';
import { cache } from 'react';
import { extractPayloadSummary } from './ai-sanitizer.service';

export interface GetActionsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: AiActionStatus | 'all';
  agentId?: string;
  entityType?: string;
  sortBy?: 'created_at' | 'updated_at' | 'started_at' | 'finished_at';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedActions {
  data: (AiAction & {
    agent?: { name: string } | null;
    creator?: { full_name: string | null } | null;
    payloadSummary: string;
  })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getAiActions = cache(async (params: GetActionsParams): Promise<PaginatedActions> => {
  const supabase = await createClient();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('ai_actions')
    .select(`
      *,
      agent:ai_agents!ai_actions_agent_id_fkey(name),
      creator:users!ai_actions_created_by_fkey(full_name)
    `, { count: 'exact' })
    .eq('workspace_id', params.workspaceId)
    .is('deleted_at', null);

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.agentId) {
    query = query.eq('agent_id', params.agentId);
  }
  if (params.entityType) {
    query = query.eq('entity_type', params.entityType);
  }
  if (params.search) {
    query = query.ilike('action_type', `%${params.search}%`);
  }

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching AI actions:', error);
    throw new Error('Failed to fetch AI actions');
  }

  return {
    data: (data as AiAction[]).map((action: any) => ({
      ...action,
      // Never send raw payload to list views — use summary only
      payloadSummary: extractPayloadSummary(action.payload),
      payload: {}, // Strip full payload from list response
      result_data: null, // Strip result_data from list response
    })),
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

export const getAiActionDetails = cache(async (workspaceId: string, actionId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_actions')
    .select(`
      *,
      agent:ai_agents!ai_actions_agent_id_fkey(id, name, description, model),
      creator:users!ai_actions_created_by_fkey(id, full_name)
    `)
    .eq('id', actionId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching AI action details:', error);
    throw new Error('Failed to fetch AI action details');
  }

  return data as AiAction & {
    agent: { id: string; name: string; description: string | null; model: string } | null;
    creator: { id: string; full_name: string | null } | null;
  };
});

export async function getAiOverviewStats(workspaceId: string) {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    agentsCount,
    pendingCount,
    approvedCount,
    rejectedCount,
    executingCount,
    completedCount,
    failedCount,
  ] = await Promise.all([
    supabase.from('ai_agents').select('*', { count: 'exact', head: true })
      .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
      .is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'pending_approval').is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'approved').is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'rejected').is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'executing').is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'completed')
      .gte('finished_at', thirtyDaysAgo).is('deleted_at', null),

    supabase.from('ai_actions').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'failed').is('deleted_at', null),
  ]);

  return {
    totalAgents: agentsCount.count || 0,
    pendingApprovals: pendingCount.count || 0,
    approvedActions: approvedCount.count || 0,
    rejectedActions: rejectedCount.count || 0,
    executingActions: executingCount.count || 0,
    completedLast30Days: completedCount.count || 0,
    failedActions: failedCount.count || 0,
  };
}
