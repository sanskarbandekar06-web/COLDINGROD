'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import type { LeadResearchInput } from '@/types/lead-research';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

interface RunLeadResearchInput {
  workspaceSlug: string;
  leadId: string;
  research: LeadResearchInput;
}

interface ResearchRpcRow {
  report_id: string;
  research_action_id: string;
  analysis_action_id: string;
  confidence: number;
  pain_point_count: number;
}

export type RunLeadResearchResult =
  | {
      success: true;
      reportId: string;
      researchActionId: string;
      analysisActionId: string;
      confidence: number;
      painPointCount: number;
    }
  | {
      success: false;
      code:
        | 'INVALID_INPUT'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'EXECUTION_FAILED';
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResearch(value: unknown): value is LeadResearchInput {
  return (
    isRecord(value) &&
    typeof value.offerings === 'string' &&
    typeof value.targetAudience === 'string' &&
    typeof value.differentiators === 'string' &&
    typeof value.recentActivity === 'string' &&
    typeof value.observedChallenges === 'string' &&
    typeof value.evidenceNotes === 'string' &&
    Array.isArray(value.sourceUrls) &&
    value.sourceUrls.every((source) => typeof source === 'string')
  );
}

function isRunInput(value: unknown): value is RunLeadResearchInput {
  return (
    isRecord(value) &&
    typeof value.workspaceSlug === 'string' &&
    typeof value.leadId === 'string' &&
    isResearch(value.research)
  );
}

function validateResearch(input: RunLeadResearchInput): string | null {
  if (
    input.workspaceSlug.trim().length === 0 ||
    input.workspaceSlug.trim().length > 120 ||
    !UUID_PATTERN.test(input.leadId)
  ) {
    return 'The workspace or lead identifier is invalid.';
  }

  const fields = [
    input.research.offerings,
    input.research.targetAudience,
    input.research.differentiators,
    input.research.recentActivity,
    input.research.observedChallenges,
    input.research.evidenceNotes,
  ];
  if (fields.some((field) => field.trim().length > 1000)) {
    return 'Research evidence fields must be 1000 characters or fewer.';
  }
  if (fields.filter((field) => field.trim().length > 0).length < 2) {
    return 'Add at least two verified research evidence fields.';
  }

  const sources = input.research.sourceUrls
    .map((source) => source.trim())
    .filter(Boolean);
  if (sources.length > 10) {
    return 'Add no more than 10 research source URLs.';
  }
  if (
    sources.some(
      (source) =>
        source.length > 500 || !HTTP_URL_PATTERN.test(source),
    )
  ) {
    return 'Every research source must be a valid HTTP(S) URL.';
  }
  return null;
}

function optional(value: string) {
  return value.trim() || undefined;
}

export async function runLeadResearchAction(
  value: unknown,
): Promise<RunLeadResearchResult> {
  if (!isRunInput(value)) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The research request is invalid.',
    };
  }

  const validationError = validateResearch(value);
  if (validationError) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: validationError,
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'You do not have access to this workspace.',
    };
  }
  if (
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Lead research requires AI and lead management permission.',
    };
  }

  const sources = [
    ...new Set(
      value.research.sourceUrls.map((source) => source.trim()).filter(Boolean),
    ),
  ];
  const researchInput = {
    source_type: 'manual_observation',
    offerings: optional(value.research.offerings),
    target_audience: optional(value.research.targetAudience),
    differentiators: optional(value.research.differentiators),
    recent_activity: optional(value.research.recentActivity),
    observed_challenges: optional(value.research.observedChallenges),
    evidence_notes: optional(value.research.evidenceNotes),
    source_urls: sources,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('run_lead_research', {
      check_workspace_id: context.workspace.id,
      check_lead_id: value.leadId,
      research_input: researchInput,
    })
    .single();

  if (error) {
    console.error('Lead research execution failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'You no longer have permission to research this lead.',
      };
    }
    if (error.code === '22023') {
      return {
        success: false,
        code: 'NOT_FOUND',
        error:
          error.message.includes('qualification')
            ? 'Run lead qualification before business research.'
            : 'The lead or research evidence is no longer valid.',
      };
    }
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The research agents could not complete this run.',
    };
  }

  const result = data as unknown as ResearchRpcRow;
  const base = `/dashboard/${workspaceSlug}`;
  revalidatePath(`${base}/leads/${value.leadId}`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/activity`);

  return {
    success: true,
    reportId: result.report_id,
    researchActionId: result.research_action_id,
    analysisActionId: result.analysis_action_id,
    confidence: result.confidence,
    painPointCount: result.pain_point_count,
  };
}
