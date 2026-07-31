export interface AnalyticsFunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface AnalyticsRecommendation {
  key: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface WorkspaceAnalyticsMetrics {
  leads_created: number;
  qualified_leads: number;
  research_reports: number;
  ai_generated_messages: number;
  approved_messages: number;
  sent_messages: number;
  responses: number;
  meetings_scheduled: number;
  won_leads: number;
  pending_approvals: number;
  active_follow_up_sequences: number;
  average_opportunity_score: number;
  approval_rate: number;
  delivery_rate: number;
  response_rate: number;
  meeting_rate: number;
  funnel: AnalyticsFunnelStage[];
  rules_version: string;
}

export interface WorkspaceAnalyticsSnapshot {
  id: string;
  workspace_id: string;
  period_days: 7 | 30 | 90;
  period_start: string;
  period_end: string;
  metrics: WorkspaceAnalyticsMetrics;
  recommendations: AnalyticsRecommendation[];
  action_id: string;
  created_by: string;
  created_at: string;
}
