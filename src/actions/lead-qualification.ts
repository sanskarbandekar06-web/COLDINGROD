'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import type {
  LeadQualificationSignals,
  QualificationBand,
  SeoStatus,
  SocialStatus,
  WebsiteStatus,
} from '@/types/lead';

const WEBSITE_STATUSES: WebsiteStatus[] = [
  'unknown',
  'none',
  'poor',
  'outdated',
  'good',
];
const SOCIAL_STATUSES: SocialStatus[] = [
  'unknown',
  'missing',
  'inactive',
  'active',
];
const SEO_STATUSES: SeoStatus[] = ['unknown', 'weak', 'average', 'strong'];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQualificationSignals(value: unknown): value is LeadQualificationSignals {
  if (!isRecord(value)) return false;

  return (
    typeof value.websiteStatus === 'string' &&
    typeof value.socialStatus === 'string' &&
    typeof value.seoStatus === 'string' &&
    (value.googleRating === null || typeof value.googleRating === 'number') &&
    (value.googleReviewCount === null ||
      typeof value.googleReviewCount === 'number') &&
    (value.hasClearCta === null || typeof value.hasClearCta === 'boolean') &&
    (value.hasOnlineBooking === null ||
      typeof value.hasOnlineBooking === 'boolean') &&
    typeof value.evidenceNotes === 'string'
  );
}

function isRunInput(value: unknown): value is RunLeadQualificationInput {
  return (
    isRecord(value) &&
    typeof value.workspaceSlug === 'string' &&
    typeof value.leadId === 'string' &&
    isQualificationSignals(value.signals)
  );
}

export interface RunLeadQualificationInput {
  workspaceSlug: string;
  leadId: string;
  signals: LeadQualificationSignals;
}

export type RunLeadQualificationResult =
  | {
      success: true;
      actionId: string;
      score: number;
      qualificationBand: QualificationBand;
      confidence: number;
    }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'EXECUTION_FAILED';
      error: string;
    };

function includesValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

function isOptionalBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
}

function knownSignalCount(signals: LeadQualificationSignals): number {
  return [
    signals.websiteStatus !== 'unknown',
    signals.socialStatus !== 'unknown',
    signals.seoStatus !== 'unknown',
    signals.googleRating !== null,
    signals.googleReviewCount !== null,
    signals.hasClearCta !== null,
    signals.hasOnlineBooking !== null,
  ].filter(Boolean).length;
}

function validateSignals(signals: LeadQualificationSignals): string | null {
  if (
    !includesValue(WEBSITE_STATUSES, signals.websiteStatus) ||
    !includesValue(SOCIAL_STATUSES, signals.socialStatus) ||
    !includesValue(SEO_STATUSES, signals.seoStatus)
  ) {
    return 'One or more qualification selections are invalid.';
  }
  if (
    !isOptionalBoolean(signals.hasClearCta) ||
    !isOptionalBoolean(signals.hasOnlineBooking)
  ) {
    return 'Website capability selections are invalid.';
  }
  if (
    signals.googleRating !== null &&
    (!Number.isFinite(signals.googleRating) ||
      signals.googleRating < 0 ||
      signals.googleRating > 5)
  ) {
    return 'Google rating must be between 0 and 5.';
  }
  if (
    signals.googleReviewCount !== null &&
    (!Number.isInteger(signals.googleReviewCount) ||
      signals.googleReviewCount < 0 ||
      signals.googleReviewCount > 1_000_000)
  ) {
    return 'Google review count must be a positive whole number.';
  }
  if (signals.evidenceNotes.trim().length > 1000) {
    return 'Evidence notes must be 1000 characters or fewer.';
  }
  if (knownSignalCount(signals) < 3) {
    return 'Add at least three known signals for a meaningful qualification.';
  }
  return null;
}

interface QualificationRpcRow {
  action_id: string;
  score: number;
  qualification_band: QualificationBand;
  confidence: number;
}

export async function runLeadQualificationAction(
  input: unknown,
): Promise<RunLeadQualificationResult> {
  if (!isRunInput(input)) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The qualification request is invalid.',
    };
  }

  const workspaceSlug = input.workspaceSlug.trim();
  const leadId = input.leadId.trim();

  if (
    workspaceSlug.length === 0 ||
    workspaceSlug.length > 120 ||
    !UUID_PATTERN.test(leadId)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The workspace or lead identifier is invalid.',
    };
  }

  const validationError = validateSignals(input.signals);
  if (validationError) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: validationError,
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
      error: 'Lead qualification requires AI and lead management permission.',
    };
  }

  const signals: Record<string, string | number | boolean> = {
    website_status: input.signals.websiteStatus,
    social_status: input.signals.socialStatus,
    seo_status: input.signals.seoStatus,
  };
  if (input.signals.googleRating !== null) {
    signals.google_rating = input.signals.googleRating;
  }
  if (input.signals.googleReviewCount !== null) {
    signals.google_review_count = input.signals.googleReviewCount;
  }
  if (input.signals.hasClearCta !== null) {
    signals.has_clear_cta = input.signals.hasClearCta;
  }
  if (input.signals.hasOnlineBooking !== null) {
    signals.has_online_booking = input.signals.hasOnlineBooking;
  }
  if (input.signals.evidenceNotes.trim()) {
    signals.evidence_notes = input.signals.evidenceNotes.trim();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('run_lead_qualification', {
      check_workspace_id: context.workspace.id,
      check_lead_id: leadId,
      input_signals: signals,
    })
    .single();

  if (error) {
    console.error('Lead qualification execution failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'You no longer have permission to qualify this lead.',
      };
    }
    if (error.code === '22023') {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'The lead or qualification evidence is no longer valid.',
      };
    }
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The qualification agent could not complete this run.',
    };
  }

  const result = data as unknown as QualificationRpcRow;
  const leadPath = `/dashboard/${workspaceSlug}/leads/${leadId}`;
  revalidatePath(leadPath);
  revalidatePath(`/dashboard/${workspaceSlug}/leads`);
  revalidatePath(`/dashboard/${workspaceSlug}/ai`);
  revalidatePath(`/dashboard/${workspaceSlug}/ai/actions`);
  revalidatePath(`/dashboard/${workspaceSlug}/activity`);

  return {
    success: true,
    actionId: result.action_id,
    score: result.score,
    qualificationBand: result.qualification_band,
    confidence: result.confidence,
  };
}
