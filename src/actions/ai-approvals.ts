'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type AiDecisionResult =
  | { success: true; approvalId: string }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'STALE_APPROVAL' | 'DATABASE_ERROR';
      error: string;
    };

async function decideAiRequestAction(
  workspaceId: string,
  actionId: string,
  workspaceSlug: string,
  decision: 'approved' | 'rejected',
  reason: string | null,
): Promise<AiDecisionResult> {
  const normalizedReason = reason?.trim() || null;
  if (
    !UUID_PATTERN.test(workspaceId) ||
    !UUID_PATTERN.test(actionId) ||
    !SLUG_PATTERN.test(workspaceSlug) ||
    workspaceSlug.length > 120 ||
    (decision === 'rejected' &&
      (!normalizedReason ||
        normalizedReason.length < 3 ||
        normalizedReason.length > 1000))
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error:
        decision === 'rejected'
          ? 'Rejection reason must be between 3 and 1000 characters.'
          : 'The approval request is invalid.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('decide_ai_action', {
      check_workspace_id: workspaceId,
      check_action_id: actionId,
      decision_value: decision,
      reason_value: normalizedReason,
    })
    .single();

  if (error) {
    console.error('AI decision failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Permission denied. Requires manage_ai.',
      };
    }
    if (error.code === 'P0002' || error.code === '23505') {
      return {
        success: false,
        code: 'STALE_APPROVAL',
        error: 'This request has already been reviewed or is unavailable.',
      };
    }
    if (error.code === '22023') {
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: error.message,
      };
    }
    return {
      success: false,
      code: 'DATABASE_ERROR',
      error: 'The decision could not be recorded. No partial change was saved.',
    };
  }

  const result = data as unknown as { approval_id: string };
  const base = `/dashboard/${workspaceSlug}`;
  revalidatePath(`${base}/ai/approvals`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/ai/actions/${actionId}`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/outreach/messages`);
  revalidatePath(`${base}/activity`);

  return { success: true, approvalId: result.approval_id };
}

export async function approveAiRequestAction(
  workspaceId: string,
  actionId: string,
  workspaceSlug: string,
) {
  return decideAiRequestAction(
    workspaceId,
    actionId,
    workspaceSlug,
    'approved',
    null,
  );
}

export async function rejectAiRequestAction(
  workspaceId: string,
  actionId: string,
  workspaceSlug: string,
  reason: string,
) {
  return decideAiRequestAction(
    workspaceId,
    actionId,
    workspaceSlug,
    'rejected',
    reason,
  );
}