import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  DiscoveryLeadReference,
  LeadDiscoveryCandidate,
  LeadDiscoveryRun,
  LeadDiscoveryRunDetail,
} from '@/types/lead-discovery';

interface CandidateRow
  extends Omit<LeadDiscoveryCandidate, 'matched_lead' | 'imported_lead'> {
  matched_lead:
    | DiscoveryLeadReference
    | DiscoveryLeadReference[]
    | null;
  imported_lead:
    | DiscoveryLeadReference
    | DiscoveryLeadReference[]
    | null;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getRecentLeadDiscoveryRuns = cache(
  async (workspaceId: string, limit = 8): Promise<LeadDiscoveryRun[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lead_discovery_runs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));

    if (error) {
      console.error('Error fetching lead discovery runs:', error.message);
      throw new Error('Failed to fetch lead discovery runs');
    }

    return (data ?? []) as LeadDiscoveryRun[];
  },
);

export const getLeadDiscoveryRun = cache(
  async (
    workspaceId: string,
    runId: string,
  ): Promise<LeadDiscoveryRunDetail | null> => {
    const supabase = await createClient();
    const { data: run, error: runError } = await supabase
      .from('lead_discovery_runs')
      .select('*')
      .eq('id', runId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (runError) {
      console.error('Error fetching lead discovery run:', runError.message);
      throw new Error('Failed to fetch lead discovery run');
    }
    if (!run) return null;

    const { data: candidates, error: candidatesError } = await supabase
      .from('lead_discovery_candidates')
      .select(`
        *,
        matched_lead:leads!lead_discovery_candidates_matched_lead_id_fkey(
          id,
          company_name
        ),
        imported_lead:leads!lead_discovery_candidates_imported_lead_id_fkey(
          id,
          company_name
        )
      `)
      .eq('run_id', runId)
      .eq('workspace_id', workspaceId)
      .order('source_index', { ascending: true });

    if (candidatesError) {
      console.error(
        'Error fetching lead discovery candidates:',
        candidatesError.message,
      );
      throw new Error('Failed to fetch lead discovery candidates');
    }

    const normalizedCandidates = (candidates as unknown as CandidateRow[]).map(
      (candidate) => ({
        ...candidate,
        matched_lead: relationOne(candidate.matched_lead),
        imported_lead: relationOne(candidate.imported_lead),
      }),
    );

    return {
      ...(run as LeadDiscoveryRun),
      candidates: normalizedCandidates,
    };
  },
);
