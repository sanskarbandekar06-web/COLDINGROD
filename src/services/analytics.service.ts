import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  AnalyticsFunnelStage,
  AnalyticsRecommendation,
  WorkspaceAnalyticsMetrics,
  WorkspaceAnalyticsSnapshot,
} from '@/types/analytics';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseFunnel(value: unknown): AnalyticsFunnelStage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stage) =>
    isRecord(stage) &&
    typeof stage.key === 'string' &&
    typeof stage.label === 'string' &&
    typeof stage.value === 'number'
      ? [{
          key: stage.key,
          label: stage.label,
          value: stage.value,
        }]
      : [],
  );
}

function parseRecommendations(value: unknown): AnalyticsRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((recommendation) =>
    isRecord(recommendation) &&
    typeof recommendation.key === 'string' &&
    typeof recommendation.title === 'string' &&
    typeof recommendation.detail === 'string' &&
    ['high', 'medium', 'low'].includes(String(recommendation.priority))
      ? [recommendation as unknown as AnalyticsRecommendation]
      : [],
  );
}

function parseMetrics(value: unknown): WorkspaceAnalyticsMetrics {
  const metrics = isRecord(value) ? value : {};
  return {
    leads_created: numberValue(metrics.leads_created),
    qualified_leads: numberValue(metrics.qualified_leads),
    research_reports: numberValue(metrics.research_reports),
    ai_generated_messages: numberValue(metrics.ai_generated_messages),
    approved_messages: numberValue(metrics.approved_messages),
    sent_messages: numberValue(metrics.sent_messages),
    responses: numberValue(metrics.responses),
    meetings_scheduled: numberValue(metrics.meetings_scheduled),
    won_leads: numberValue(metrics.won_leads),
    pending_approvals: numberValue(metrics.pending_approvals),
    active_follow_up_sequences: numberValue(
      metrics.active_follow_up_sequences,
    ),
    average_opportunity_score: numberValue(
      metrics.average_opportunity_score,
    ),
    approval_rate: numberValue(metrics.approval_rate),
    delivery_rate: numberValue(metrics.delivery_rate),
    response_rate: numberValue(metrics.response_rate),
    meeting_rate: numberValue(metrics.meeting_rate),
    funnel: parseFunnel(metrics.funnel),
    rules_version:
      typeof metrics.rules_version === 'string'
        ? metrics.rules_version
        : 'unknown',
  };
}

export const getAnalyticsSnapshots = cache(
  async (
    workspaceId: string,
    limit = 10,
  ): Promise<WorkspaceAnalyticsSnapshot[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspace_analytics_snapshots')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 30));

    if (error) {
      console.error('Error fetching analytics snapshots:', error.message);
      throw new Error('Failed to fetch analytics snapshots');
    }

    return (data ?? []).map((row) => ({
      ...(row as Omit<
        WorkspaceAnalyticsSnapshot,
        'metrics' | 'recommendations'
      >),
      metrics: parseMetrics(row.metrics),
      recommendations: parseRecommendations(row.recommendations),
    }));
  },
);
