import { createClient } from '@/lib/supabase/server';
import { Activity } from '@/types/dashboard';

export async function getRecentActivities(workspaceId: string, limit = 10, offset = 0): Promise<Activity[]> {
  const supabase = await createClient();

  // In a real scenario we'd do a join via foreign keys, or two separate queries if PostgREST doesn't support the union out of box
  // Since we want both human and ai_agent actors, we'll fetch activities, then manually fetch the actor names to avoid complex raw SQL for now.
  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !activities) {
    console.error('Error fetching activities:', error);
    return [];
  }

  // We need to resolve actor_name from users or ai_agents
  const userIds = activities.filter(a => a.actor_type === 'human' && a.actor_user_id).map(a => a.actor_user_id);
  const agentIds = activities.filter(a => a.actor_type === 'ai_agent' && a.actor_agent_id).map(a => a.actor_agent_id);

  const usersMap: Record<string, string> = {};
  const agentsMap: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds);
    if (usersData) {
      usersData.forEach(u => usersMap[u.id] = u.full_name || 'Unknown User');
    }
  }

  if (agentIds.length > 0) {
    const { data: agentsData } = await supabase
      .from('ai_agents')
      .select('id, name')
      .in('id', agentIds);
    if (agentsData) {
      agentsData.forEach(a => agentsMap[a.id] = a.name);
    }
  }

  return activities.map(a => ({
    id: a.id,
    workspace_id: a.workspace_id,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    actor_type: a.actor_type as 'human' | 'ai_agent' | 'system',
    actor_name: a.actor_type === 'human' ? usersMap[a.actor_user_id] : a.actor_type === 'ai_agent' ? agentsMap[a.actor_agent_id] : 'System',
    action: a.action,
    metadata: a.metadata,
    created_at: a.created_at
  }));
}
