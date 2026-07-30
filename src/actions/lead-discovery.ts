'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import type {
  LeadDiscoveryBriefInput,
  LeadDiscoveryCandidateInput,
} from '@/types/lead-discovery';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RunLeadDiscoveryInput {
  workspaceSlug: string;
  brief: LeadDiscoveryBriefInput;
  candidates: LeadDiscoveryCandidateInput[];
}

interface ImportLeadDiscoveryInput {
  workspaceSlug: string;
  runId: string;
  candidateIds: string[];
}

interface DiscoveryRpcRow {
  run_id: string;
  action_id: string;
  candidate_count: number;
  ready_count: number;
  duplicate_count: number;
}

interface ImportRpcRow {
  action_id: string;
  selected_count: number;
  imported_count: number;
  duplicate_count: number;
}

type DiscoveryErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'EXECUTION_FAILED';

export type RunLeadDiscoveryResult =
  | {
      success: true;
      runId: string;
      actionId: string;
      candidateCount: number;
      readyCount: number;
      duplicateCount: number;
    }
  | { success: false; code: DiscoveryErrorCode; error: string };

export type ImportLeadDiscoveryResult =
  | {
      success: true;
      actionId: string;
      selectedCount: number;
      importedCount: number;
      duplicateCount: number;
    }
  | { success: false; code: DiscoveryErrorCode; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyStringValues(
  value: Record<string, unknown>,
  keys: readonly string[],
) {
  return keys.every((key) => typeof value[key] === 'string');
}

function isBrief(value: unknown): value is LeadDiscoveryBriefInput {
  return (
    isRecord(value) &&
    hasOnlyStringValues(value, [
      'runName',
      'market',
      'location',
      'serviceFocus',
      'notes',
    ])
  );
}

function isCandidate(value: unknown): value is LeadDiscoveryCandidateInput {
  return (
    isRecord(value) &&
    hasOnlyStringValues(value, [
      'companyName',
      'websiteUrl',
      'industry',
      'location',
      'sourceUrl',
      'businessEmail',
      'businessPhone',
      'evidenceNotes',
    ])
  );
}

function isRunInput(value: unknown): value is RunLeadDiscoveryInput {
  return (
    isRecord(value) &&
    typeof value.workspaceSlug === 'string' &&
    isBrief(value.brief) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidate)
  );
}

function isImportInput(value: unknown): value is ImportLeadDiscoveryInput {
  return (
    isRecord(value) &&
    typeof value.workspaceSlug === 'string' &&
    typeof value.runId === 'string' &&
    Array.isArray(value.candidateIds) &&
    value.candidateIds.every((id) => typeof id === 'string')
  );
}

function optionalLength(value: string, maximum: number) {
  return value.trim().length <= maximum;
}

function validateRunInput(input: RunLeadDiscoveryInput): string | null {
  const brief = input.brief;
  if (
    input.workspaceSlug.trim().length === 0 ||
    input.workspaceSlug.trim().length > 120
  ) {
    return 'The workspace identifier is invalid.';
  }
  if (brief.runName.trim().length < 2 || brief.runName.trim().length > 160) {
    return 'Discovery name must be between 2 and 160 characters.';
  }
  if (
    !optionalLength(brief.market, 160) ||
    !optionalLength(brief.location, 240) ||
    !optionalLength(brief.serviceFocus, 240) ||
    !optionalLength(brief.notes, 1000)
  ) {
    return 'One or more discovery brief fields are too long.';
  }
  if (input.candidates.length < 1 || input.candidates.length > 50) {
    return 'Add between 1 and 50 observed businesses.';
  }

  for (const [index, candidate] of input.candidates.entries()) {
    const label = `Business ${index + 1}`;
    const companyName = candidate.companyName.trim();
    if (companyName.length < 2 || companyName.length > 160) {
      return `${label} needs a company name between 2 and 160 characters.`;
    }
    if (
      !optionalLength(candidate.websiteUrl, 500) ||
      !optionalLength(candidate.industry, 160) ||
      !optionalLength(candidate.location, 240) ||
      !optionalLength(candidate.sourceUrl, 500) ||
      !optionalLength(candidate.businessEmail, 320) ||
      !optionalLength(candidate.businessPhone, 80) ||
      !optionalLength(candidate.evidenceNotes, 1000)
    ) {
      return `${label} contains a field that is too long.`;
    }
    if (
      candidate.websiteUrl.trim() &&
      !HTTP_URL_PATTERN.test(candidate.websiteUrl.trim())
    ) {
      return `${label} website must begin with http:// or https://.`;
    }
    if (
      candidate.sourceUrl.trim() &&
      !HTTP_URL_PATTERN.test(candidate.sourceUrl.trim())
    ) {
      return `${label} source must begin with http:// or https://.`;
    }
    if (
      candidate.businessEmail.trim() &&
      !EMAIL_PATTERN.test(candidate.businessEmail.trim())
    ) {
      return `${label} email address is invalid.`;
    }
  }
  return null;
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function revalidateDiscoveryPaths(workspaceSlug: string, runId?: string) {
  const base = `/dashboard/${workspaceSlug}`;
  revalidatePath(`${base}/leads`);
  revalidatePath(`${base}/leads/discovery`);
  if (runId) revalidatePath(`${base}/leads/discovery/${runId}`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/activity`);
}

export async function runLeadDiscoveryAction(
  value: unknown,
): Promise<RunLeadDiscoveryResult> {
  if (!isRunInput(value)) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The lead discovery request is invalid.',
    };
  }

  const validationError = validateRunInput(value);
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
      error: 'Lead discovery requires AI and lead management permission.',
    };
  }

  const brief = {
    run_name: value.brief.runName.trim(),
    market: optional(value.brief.market),
    location: optional(value.brief.location),
    service_focus: optional(value.brief.serviceFocus),
    notes: optional(value.brief.notes),
  };
  const candidates = value.candidates.map((candidate) => ({
    company_name: candidate.companyName.trim(),
    website_url: optional(candidate.websiteUrl),
    industry: optional(candidate.industry),
    location: optional(candidate.location) ?? optional(value.brief.location),
    source_url: optional(candidate.sourceUrl),
    business_email: optional(candidate.businessEmail)?.toLowerCase(),
    business_phone: optional(candidate.businessPhone),
    evidence_notes: optional(candidate.evidenceNotes),
  }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('run_lead_discovery_intake', {
      check_workspace_id: context.workspace.id,
      intake_brief: brief,
      intake_candidates: candidates,
    })
    .single();

  if (error) {
    console.error('Lead discovery execution failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'You no longer have permission to run lead discovery.',
      };
    }
    if (error.code === '22023') {
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: 'The discovery brief or candidate evidence is no longer valid.',
      };
    }
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The Lead Discovery Agent could not complete this run.',
    };
  }

  const result = data as unknown as DiscoveryRpcRow;
  revalidateDiscoveryPaths(workspaceSlug, result.run_id);
  return {
    success: true,
    runId: result.run_id,
    actionId: result.action_id,
    candidateCount: result.candidate_count,
    readyCount: result.ready_count,
    duplicateCount: result.duplicate_count,
  };
}

export async function importLeadDiscoveryCandidatesAction(
  value: unknown,
): Promise<ImportLeadDiscoveryResult> {
  if (!isImportInput(value)) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The discovery import request is invalid.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const candidateIds = [...new Set(value.candidateIds.map((id) => id.trim()))];
  if (
    workspaceSlug.length === 0 ||
    workspaceSlug.length > 120 ||
    !UUID_PATTERN.test(value.runId) ||
    candidateIds.length < 1 ||
    candidateIds.length > 50 ||
    candidateIds.length !== value.candidateIds.length ||
    candidateIds.some((id) => !UUID_PATTERN.test(id))
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Select between 1 and 50 valid, unique businesses.',
    };
  }

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
      error: 'Lead import requires AI and lead management permission.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('import_lead_discovery_candidates', {
      check_workspace_id: context.workspace.id,
      check_run_id: value.runId,
      check_candidate_ids: candidateIds,
    })
    .single();

  if (error) {
    console.error('Lead discovery import failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'You no longer have permission to import these leads.',
      };
    }
    if (error.code === '22023') {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'One or more selected businesses are no longer importable.',
      };
    }
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The selected leads could not be imported.',
    };
  }

  const result = data as unknown as ImportRpcRow;
  revalidateDiscoveryPaths(workspaceSlug, value.runId);
  return {
    success: true,
    actionId: result.action_id,
    selectedCount: result.selected_count,
    importedCount: result.imported_count,
    duplicateCount: result.duplicate_count,
  };
}
