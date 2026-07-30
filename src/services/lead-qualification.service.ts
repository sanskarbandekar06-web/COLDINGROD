import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  LeadQualificationAnalysis,
  LeadQualificationFactor,
  LeadQualificationSnapshot,
  QualificationBand,
} from '@/types/lead';

const QUALIFICATION_BANDS = new Set<QualificationBand>([
  'high_priority',
  'qualified',
  'nurture',
  'low_opportunity',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFactor(value: unknown): LeadQualificationFactor | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.key !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.signal !== 'string' ||
    typeof value.points !== 'number'
  ) {
    return null;
  }

  return {
    key: value.key,
    label: value.label,
    signal: value.signal,
    points: value.points,
  };
}

function parseAnalysis(value: unknown): LeadQualificationAnalysis | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.qualification_band !== 'string' ||
    !QUALIFICATION_BANDS.has(value.qualification_band as QualificationBand) ||
    typeof value.confidence !== 'number' ||
    !Array.isArray(value.factors) ||
    !Array.isArray(value.opportunities)
  ) {
    return null;
  }

  const parsedFactors = value.factors
    .map(parseFactor)
    .filter((factor): factor is LeadQualificationFactor => factor !== null);
  const parsedOpportunities = value.opportunities.filter(
    (opportunity): opportunity is string => typeof opportunity === 'string',
  );

  return {
    qualification_band: value.qualification_band as QualificationBand,
    confidence: value.confidence,
    factors: parsedFactors,
    opportunities: parsedOpportunities,
  };
}

interface QualificationActionRow {
  id: string;
  status: string;
  created_at: string;
  agent: { name: string } | { name: string }[] | null;
}

interface QualificationRow {
  id: string;
  lead_id: string;
  score: number;
  algorithm_version: string | null;
  factors: unknown;
  ai_action_id: string | null;
  scored_at: string;
  action: QualificationActionRow | QualificationActionRow[] | null;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getLeadQualificationHistory = cache(
  async (
    workspaceId: string,
    leadId: string,
    limit = 5,
  ): Promise<LeadQualificationSnapshot[]> => {
    const supabase = await createClient();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (leadError) {
      console.error('Error validating lead qualification workspace:', leadError.message);
      throw new Error('Failed to validate lead qualification');
    }
    if (!lead) return [];

    const { data, error } = await supabase
      .from('lead_scores')
      .select(`
        id,
        lead_id,
        score,
        algorithm_version,
        factors,
        ai_action_id,
        scored_at,
        action:ai_actions!lead_scores_ai_action_id_fkey(
          id,
          status,
          created_at,
          agent:ai_agents!ai_actions_agent_id_fkey(name)
        )
      `)
      .eq('lead_id', leadId)
      .order('scored_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));

    if (error) {
      console.error('Error fetching lead qualification history:', error.message);
      throw new Error('Failed to fetch lead qualification history');
    }

    return (data as unknown as QualificationRow[]).map((row) => {
      const action = relationOne(row.action);
      return {
        id: row.id,
        lead_id: row.lead_id,
        score: row.score,
        algorithm_version: row.algorithm_version,
        factors: parseAnalysis(row.factors),
        ai_action_id: row.ai_action_id,
        scored_at: row.scored_at,
        action: action
          ? {
              id: action.id,
              status: action.status,
              created_at: action.created_at,
              agent: relationOne(action.agent),
            }
          : null,
      };
    });
  },
);
