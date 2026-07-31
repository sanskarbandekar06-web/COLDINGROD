import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  LeadPainPoint,
  LeadResearchReport,
  LeadResearchSummary,
} from '@/types/lead-research';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSummary(value: unknown): LeadResearchSummary {
  if (!isRecord(value)) return {};
  const summary: LeadResearchSummary = {};
  const keys = [
    'offerings',
    'target_audience',
    'differentiators',
    'recent_activity',
    'observed_challenges',
    'evidence_notes',
  ] as const;
  for (const key of keys) {
    if (typeof value[key] === 'string') summary[key] = value[key];
  }
  return summary;
}

function parsePainPoint(value: unknown): LeadPainPoint | null {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.evidence !== 'string' ||
    typeof value.impact !== 'string' ||
    typeof value.service_opportunity !== 'string' ||
    !['high', 'medium', 'low'].includes(String(value.priority)) ||
    typeof value.points !== 'number'
  ) {
    return null;
  }
  return value as unknown as LeadPainPoint;
}

interface ResearchRow
  extends Omit<
    LeadResearchReport,
    'research_summary' | 'source_urls' | 'pain_points'
  > {
  research_summary: unknown;
  source_urls: unknown;
  pain_points: unknown;
}

export const getLeadResearchHistory = cache(
  async (
    workspaceId: string,
    leadId: string,
    limit = 5,
  ): Promise<LeadResearchReport[]> => {
    const supabase = await createClient();
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (leadError) {
      console.error('Error validating research lead:', leadError.message);
      throw new Error('Failed to validate research lead');
    }
    if (!lead) return [];

    const { data, error } = await supabase
      .from('lead_research_reports')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));

    if (error) {
      console.error('Error fetching lead research:', error.message);
      throw new Error('Failed to fetch lead research');
    }

    return ((data ?? []) as ResearchRow[]).map((row) => ({
      ...row,
      research_summary: parseSummary(row.research_summary),
      source_urls: Array.isArray(row.source_urls)
        ? row.source_urls.filter(
            (source): source is string => typeof source === 'string',
          )
        : [],
      pain_points: Array.isArray(row.pain_points)
        ? row.pain_points
            .map(parsePainPoint)
            .filter((point): point is LeadPainPoint => point !== null)
        : [],
    }));
  },
);
