export interface DashboardStats {
  totalLeads: number;
  totalClients: number;
  totalProjects: number;
  openTasks: number;
  meetingsToday: number;
  pendingAiActions: number;
}

export interface Activity {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  actor_type: 'human' | 'ai_agent' | 'system';
  actor_name: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
