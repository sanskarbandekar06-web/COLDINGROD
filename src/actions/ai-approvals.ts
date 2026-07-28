'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Valid status transitions for approval workflow.
 * Only pending_approval can transition to approved or rejected.
 * Any other source status is invalid and must be rejected server-side.
 */
const APPROVABLE_STATUS = 'pending_approval' as const;

async function checkManageAiPermission(
  workspaceId: string
): Promise<{ permitted: boolean; userId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { permitted: false, userId: null };

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`workspace_permissions(permissions(key))`)
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return { permitted: false, userId: user.id };

  const perms =
    (data.workspace_permissions as unknown as {
      permissions: { key: string } | null;
    }[]) || [];
  const permitted = perms.some((p) => p.permissions?.key === 'manage_ai');
  return { permitted, userId: user.id };
}

/**
 * Approve an AI action.
 *
 * Concurrency strategy (Database v1.0, no RPC transaction available):
 *   Step 1 — Conditional fetch: verify the action belongs to this workspace, is
 *             not deleted, and has status = 'pending_approval'. If not found, abort.
 *   Step 2 — Conditional update: update status to 'approved' only where
 *             workspace_id matches AND status is still 'pending_approval'.
 *             This prevents a race condition between two concurrent reviewers.
 *   Step 3 — Insert ai_approvals row. The UNIQUE constraint on ai_action_id
 *             prevents duplicate approval records. A constraint violation here
 *             means another reviewer won the race; we surface this as a
 *             STALE_APPROVAL error rather than a silent failure.
 *
 * Limitation (Database v1.1 candidate): Steps 2 and 3 are not wrapped in a
 * single database transaction. If Step 2 succeeds but Step 3 fails for any reason
 * other than a UNIQUE violation, the ai_actions status is updated to 'approved'
 * but no audit record exists. This inconsistency is surfaced to the user as a
 * PARTIAL_FAILURE error and must be resolved manually until an RPC is available.
 */
export async function approveAiRequestAction(workspaceId: string, actionId: string) {
  const { permitted, userId } = await checkManageAiPermission(workspaceId);
  if (!permitted || !userId) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Permission denied. Requires manage_ai.' };
  }

  const supabase = await createClient();

  // Step 1: Conditional fetch — verify workspace ownership AND pending status
  const { data: existingAction, error: fetchError } = await supabase
    .from('ai_actions')
    .select('id, status')
    .eq('id', actionId)
    .eq('workspace_id', workspaceId) // Workspace isolation
    .eq('status', APPROVABLE_STATUS) // Status transition guard
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingAction) {
    return {
      success: false,
      code: 'STALE_APPROVAL',
      error: 'This request has already been reviewed or does not belong to this workspace.',
    };
  }

  // Step 2: Conditional update — only transitions from pending_approval
  const { error: updateError, count: updatedRows } = await supabase
    .from('ai_actions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('workspace_id', workspaceId)
    .eq('status', APPROVABLE_STATUS); // Second concurrency guard

  if (updateError) {
    console.error('Approval update error:', updateError.message);
    return {
      success: false,
      code: 'UPDATE_FAILED',
      error: 'Failed to transition action status. The action may have already been reviewed.',
    };
  }

  // Step 3: Insert approval audit record
  // approver_id is ALWAYS derived from server-side auth — never from client input
  const { error: approvalError } = await supabase.from('ai_approvals').insert({
    ai_action_id: actionId,
    workspace_id: workspaceId,
    approver_id: userId, // Server-derived — not from client
    decision: 'approved',
    reason: null,
    approved_payload: null, // Not writing approved_payload in Phase 2.6 (Phase 2.7)
    decided_at: new Date().toISOString(),
  });

  if (approvalError) {
    // UNIQUE constraint violation (23505) means another reviewer's record already exists
    if (approvalError.code === '23505') {
      return {
        success: false,
        code: 'STALE_APPROVAL',
        error: 'This request has already been reviewed by another user.',
      };
    }
    console.error('Approval insert error:', approvalError.message);
    // Partial failure: action is now 'approved' but no audit record saved
    return {
      success: false,
      code: 'PARTIAL_FAILURE',
      error:
        'The action was approved, but the audit record could not be saved. Please contact your administrator.',
    };
  }

  // Activity record — non-critical, log if it fails
  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'ai_action',
      entity_id: actionId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'approval_granted',
      metadata: { decision: 'approved' },
    });
  } catch {
    // Non-critical — do not fail the approval if activity logging fails
  }

  revalidatePath(`/dashboard/[workspaceSlug]/ai/approvals`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/ai/actions`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/ai`, 'page');
  return { success: true };
}

/**
 * Reject an AI action.
 *
 * Uses the same two-step conditional strategy as approveAiRequestAction.
 * Rejection reason is required and stored in ai_approvals.reason (TEXT column).
 * Does NOT store reasons in activities metadata — only a safe summary.
 */
export async function rejectAiRequestAction(
  workspaceId: string,
  actionId: string,
  reason: string
) {
  const { permitted, userId } = await checkManageAiPermission(workspaceId);
  if (!permitted || !userId) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Permission denied. Requires manage_ai.' };
  }

  const trimmedReason = reason?.trim() || '';
  if (trimmedReason.length < 3 || trimmedReason.length > 1000) {
    return {
      success: false,
      code: 'VALIDATION_FAILED',
      error: 'Rejection reason must be between 3 and 1000 characters.',
    };
  }

  const supabase = await createClient();

  // Step 1: Conditional fetch
  const { data: existingAction, error: fetchError } = await supabase
    .from('ai_actions')
    .select('id, status')
    .eq('id', actionId)
    .eq('workspace_id', workspaceId)
    .eq('status', APPROVABLE_STATUS)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingAction) {
    return {
      success: false,
      code: 'STALE_APPROVAL',
      error: 'This request has already been reviewed or does not belong to this workspace.',
    };
  }

  // Step 2: Conditional update
  const { error: updateError } = await supabase
    .from('ai_actions')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('workspace_id', workspaceId)
    .eq('status', APPROVABLE_STATUS);

  if (updateError) {
    console.error('Rejection update error:', updateError.message);
    return {
      success: false,
      code: 'UPDATE_FAILED',
      error: 'Failed to transition action status. The action may have already been reviewed.',
    };
  }

  // Step 3: Insert rejection audit record
  const { error: approvalError } = await supabase.from('ai_approvals').insert({
    ai_action_id: actionId,
    workspace_id: workspaceId,
    approver_id: userId,
    decision: 'rejected',
    reason: trimmedReason,
    approved_payload: null,
    decided_at: new Date().toISOString(),
  });

  if (approvalError) {
    if (approvalError.code === '23505') {
      return {
        success: false,
        code: 'STALE_APPROVAL',
        error: 'This request has already been reviewed by another user.',
      };
    }
    console.error('Rejection insert error:', approvalError.message);
    return {
      success: false,
      code: 'PARTIAL_FAILURE',
      error:
        'The action was rejected, but the audit record could not be saved. Please contact your administrator.',
    };
  }

  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'ai_action',
      entity_id: actionId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'approval_rejected',
      // Store only a safe summary — not the full reason text
      metadata: { decision: 'rejected' },
    });
  } catch {
    // Non-critical
  }

  revalidatePath(`/dashboard/[workspaceSlug]/ai/approvals`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/ai/actions`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/ai`, 'page');
  return { success: true };
}
