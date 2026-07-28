import { createClient } from '@/lib/supabase/server';
import { DashboardStats } from '@/types/dashboard';

export async function getDashboardStats(workspaceId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  const [
    leadsCount,
    clientsCount,
    projectsCount,
    openTasksCount,
    meetingsTodayCount,
    pendingAiActionsCount
  ] = await Promise.all([
    // Leads
    supabase.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    // Clients
    supabase.from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    // Projects
    supabase.from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    // Open Tasks
    supabase.from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .not('status', 'in', '("completed","cancelled")')
      .is('deleted_at', null),

    // Meetings Today
    supabase.from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('start_time', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .lt('start_time', new Date(new Date().setHours(23, 59, 59, 999)).toISOString())
      .is('deleted_at', null),

    // Pending AI Actions
    supabase.from('ai_actions')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending_approval')
      .is('deleted_at', null)
  ]);

  return {
    totalLeads: leadsCount.count || 0,
    totalClients: clientsCount.count || 0,
    totalProjects: projectsCount.count || 0,
    openTasks: openTasksCount.count || 0,
    meetingsToday: meetingsTodayCount.count || 0,
    pendingAiActions: pendingAiActionsCount.count || 0,
  };
}
