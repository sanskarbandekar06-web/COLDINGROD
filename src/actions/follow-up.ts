'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CADENCES = {
  standard: [3, 7, 14],
  gentle: [5, 12],
  compact: [3, 8],
} as const;

type FollowUpActionResult =
  | {
      success: true;
      sequenceId?: string;
      messageId?: string;
      outcome?: string;
      status?: string;
      dueAt?: string | null;
    }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'NOT_READY' | 'DATABASE_ERROR';
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getAuthorizedContext(workspaceSlug: string) {
  const context = await getWorkspaceContext(workspaceSlug);
  if (
    !context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return null;
  }
  return context;
}

function revalidateFollowUpPaths(
  workspaceSlug: string,
  messageId?: string,
) {
  const base = `/dashboard/${workspaceSlug}`;
  if (messageId) revalidatePath(`${base}/outreach/messages/${messageId}`);
  revalidatePath(`${base}/outreach`);
  revalidatePath(`${base}/outreach/messages`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/ai/approvals`);
  revalidatePath(`${base}/activity`);
}

function rpcFailure(error: {
  code?: string;
  message: string;
}): FollowUpActionResult {
  console.error('Follow-up RPC failed:', error.message);
  if (error.code === '42501') {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }
  if (error.code === '22023' || error.code === '23505') {
    return {
      success: false,
      code: 'NOT_READY',
      error: error.message,
    };
  }
  return {
    success: false,
    code: 'DATABASE_ERROR',
    error: 'The follow-up operation could not be completed.',
  };
}

export async function createFollowUpSequenceAction(
  value: unknown,
): Promise<FollowUpActionResult> {
  if (
    !isRecord(value) ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.messageId !== 'string' ||
    typeof value.cadence !== 'string' ||
    !UUID_PATTERN.test(value.messageId) ||
    !(value.cadence in CADENCES)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Choose a valid follow-up cadence.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getAuthorizedContext(workspaceSlug);
  if (!context) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const cadence = value.cadence as keyof typeof CADENCES;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('create_follow_up_sequence', {
      check_workspace_id: context.workspace.id,
      check_message_id: value.messageId,
      sequence_input: { cadence_days: CADENCES[cadence] },
    })
    .single();

  if (error) return rpcFailure(error);
  const result = data as unknown as { sequence_id: string };
  revalidateFollowUpPaths(workspaceSlug, value.messageId);
  return { success: true, sequenceId: result.sequence_id };
}

export async function prepareDueFollowUpAction(
  value: unknown,
): Promise<FollowUpActionResult> {
  if (
    !isRecord(value) ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.sequenceId !== 'string' ||
    typeof value.messageId !== 'string' ||
    !UUID_PATTERN.test(value.sequenceId) ||
    !UUID_PATTERN.test(value.messageId)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The follow-up request is invalid.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getAuthorizedContext(workspaceSlug);
  if (!context) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('prepare_due_follow_up', {
      check_workspace_id: context.workspace.id,
      check_sequence_id: value.sequenceId,
    })
    .single();

  if (error) return rpcFailure(error);
  const result = data as unknown as {
    outcome: string;
    sequence_status: string;
    message_id: string | null;
    due_at: string | null;
  };
  revalidateFollowUpPaths(workspaceSlug, value.messageId);
  return {
    success: true,
    messageId: result.message_id ?? undefined,
    outcome: result.outcome,
    status: result.sequence_status,
    dueAt: result.due_at,
  };
}

export async function setFollowUpSequenceStatusAction(
  value: unknown,
): Promise<FollowUpActionResult> {
  if (
    !isRecord(value) ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.sequenceId !== 'string' ||
    typeof value.messageId !== 'string' ||
    typeof value.status !== 'string' ||
    !UUID_PATTERN.test(value.sequenceId) ||
    !UUID_PATTERN.test(value.messageId) ||
    !['active', 'paused', 'cancelled'].includes(value.status)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The follow-up status request is invalid.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getAuthorizedContext(workspaceSlug);
  if (!context) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'set_follow_up_sequence_status',
    {
      check_workspace_id: context.workspace.id,
      check_sequence_id: value.sequenceId,
      desired_status: value.status,
    },
  );

  if (error) return rpcFailure(error);
  revalidateFollowUpPaths(workspaceSlug, value.messageId);
  return { success: true, status: String(data) };
}
