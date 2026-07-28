'use server';

/**
 * outreach.ts — Server Actions for outreach messages
 *
 * Permission used: manage_leads (only verified permission for lead-scoped entities)
 * Permission used for AI approval: manage_ai (reuses Phase 2.6 approval actions)
 *
 * Edit-after-approval rule:
 *   - draft: editable
 *   - pending_approval with no ai_approvals decision yet: editable
 *   - Any other status (approved, rejected, sent, delivered, failed, replied,
 *     scheduled, or an ai_approvals row already exists): read-only
 *   - Archived: read-only
 *
 * Workspace isolation: every action validates both the message workspace_id
 * and all linked entities (lead, contact) against the active workspace.
 *
 * Active content strategy: outreach_messages.content is authoritative.
 * Every human edit also inserts a message_versions audit row.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  validateLeadWorkspaceOwnership,
  validateContactLeadOwnership,
} from '@/services/outreach.service';
import { insertMessageVersion } from '@/services/message-version.service';
import {
  EDITABLE_STATUSES,
  OUTREACH_PLATFORMS,
  type OutreachPlatform,
  type OutreachStatus,
} from '@/types/outreach';

// ──────────────────────────────────────────────────────────────────────────────
// Shared permission helper
// ──────────────────────────────────────────────────────────────────────────────

async function checkManageLeadsPermission(
  workspaceId: string
): Promise<{ permitted: boolean; userId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { permitted: false, userId: null };

  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_permissions(permissions(key))')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!data) return { permitted: false, userId: user.id };

  const perms =
    (
      data.workspace_permissions as unknown as {
        permissions: { key: string } | null;
      }[]
    ) || [];
  const permitted = perms.some((p) => p.permissions?.key === 'manage_leads');
  return { permitted, userId: user.id };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action result type
// ──────────────────────────────────────────────────────────────────────────────

type ActionErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_CHANNEL'
  | 'INVALID_STATUS'
  | 'INVALID_RECIPIENT'
  | 'MESSAGE_NOT_EDITABLE'
  | 'APPROVAL_ALREADY_DECIDED'
  | 'VERSION_CONFLICT'
  | 'CROSS_WORKSPACE_REFERENCE'
  | 'DATABASE_ERROR';

interface ActionSuccess {
  success: true;
  messageId?: string;
}
interface ActionFailure {
  success: false;
  code: ActionErrorCode;
  error: string;
}
type ActionResult = ActionSuccess | ActionFailure;

// ──────────────────────────────────────────────────────────────────────────────
// createOutreachDraftAction
// ──────────────────────────────────────────────────────────────────────────────

export async function createOutreachDraftAction(
  workspaceSlug: string,
  workspaceId: string,
  formData: FormData
): Promise<ActionResult> {
  // 1. Authenticate + permission
  const { permitted, userId } = await checkManageLeadsPermission(workspaceId);
  if (!permitted || !userId) {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'Permission denied. Requires manage_leads.',
    };
  }

  // 2. Extract and validate inputs
  const leadId = (formData.get('lead_id') as string | null)?.trim();
  const contactId =
    ((formData.get('contact_id') as string | null)?.trim() || null) || null;
  const platform = (formData.get('platform') as string | null)?.trim();
  const subject =
    ((formData.get('subject') as string | null)?.trim() || null) || null;
  const content = (formData.get('content') as string | null)?.trim();

  if (!leadId) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Lead is required.' };
  }
  if (!platform || !(OUTREACH_PLATFORMS as string[]).includes(platform)) {
    return { success: false, code: 'INVALID_CHANNEL', error: 'Invalid channel selected.' };
  }
  if (!content || content.length < 1) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Message content is required.' };
  }
  if (content.length > 10000) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Message content exceeds 10,000 characters.',
    };
  }

  // 3. Validate lead workspace ownership (server-side)
  const leadValid = await validateLeadWorkspaceOwnership(workspaceId, leadId);
  if (!leadValid) {
    return {
      success: false,
      code: 'CROSS_WORKSPACE_REFERENCE',
      error: 'Lead not found or does not belong to this workspace.',
    };
  }

  // 4. Validate contact if provided
  if (contactId) {
    const contactValid = await validateContactLeadOwnership(leadId, contactId);
    if (!contactValid) {
      return {
        success: false,
        code: 'INVALID_RECIPIENT',
        error: 'Contact does not belong to the selected lead.',
      };
    }
  }

  const supabase = await createClient();

  // 5. Insert the outreach message
  const { data: message, error: insertError } = await supabase
    .from('outreach_messages')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      contact_id: contactId,
      platform: platform as OutreachPlatform,
      direction: 'outbound',
      subject,
      content,
      status: 'draft' as OutreachStatus,
      ai_action_id: null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Error creating outreach draft:', insertError.message);
    return { success: false, code: 'DATABASE_ERROR', error: 'Failed to create message.' };
  }

  // 6. Insert initial version record
  await insertMessageVersion(
    workspaceId,
    message.id,
    content,
    userId,
    'Initial draft'
  );

  // 7. Log activity
  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'outreach_message',
      entity_id: message.id,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'message_draft_created',
      metadata: { platform, lead_id: leadId },
    });
  } catch {
    // Non-critical
  }

  // 8. Revalidate
  revalidatePath(`/dashboard/${workspaceSlug}/outreach`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages`, 'page');

  return { success: true, messageId: message.id };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateMessageContentAction
// ──────────────────────────────────────────────────────────────────────────────

export async function updateMessageContentAction(
  workspaceSlug: string,
  workspaceId: string,
  messageId: string,
  content: string,
  changeReason: string | null
): Promise<ActionResult> {
  // 1. Authenticate + permission
  const { permitted, userId } = await checkManageLeadsPermission(workspaceId);
  if (!permitted || !userId) {
    return { success: false, code: 'FORBIDDEN', error: 'Permission denied. Requires manage_leads.' };
  }

  // 2. Validate content
  const trimmed = content?.trim() ?? '';
  if (trimmed.length < 1) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Content cannot be empty.' };
  }
  if (trimmed.length > 10000) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Content exceeds 10,000 characters.' };
  }

  const supabase = await createClient();

  // 3. Fetch and validate message with workspace ownership
  const { data: message, error: fetchError } = await supabase
    .from('outreach_messages')
    .select('id, workspace_id, status, ai_action_id, deleted_at')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (fetchError || !message) {
    return { success: false, code: 'NOT_FOUND', error: 'Message not found.' };
  }

  // 4. Check not archived
  if (message.deleted_at !== null) {
    return {
      success: false,
      code: 'MESSAGE_NOT_EDITABLE',
      error: 'Archived messages cannot be edited.',
    };
  }

  // 5. Edit-after-approval rule
  // Draft is always editable. Any other status requires further checks.
  if (!(EDITABLE_STATUSES as string[]).includes(message.status)) {
    // Allow editing pending_approval only if no approval decision yet and no completed ai_action
    if (message.status === 'pending_approval' && message.ai_action_id) {
      // Check if an ai_approvals row already exists
      const { data: existingApproval } = await supabase
        .from('ai_approvals')
        .select('id, decision')
        .eq('ai_action_id', message.ai_action_id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (existingApproval) {
        return {
          success: false,
          code: 'APPROVAL_ALREADY_DECIDED',
          error: `Cannot edit: this message was already ${existingApproval.decision} by a reviewer.`,
        };
      }
      // No decision yet — allow edit, but do NOT change ai_action status
    } else {
      // scheduled, sent, delivered, failed, replied → read-only
      return {
        success: false,
        code: 'MESSAGE_NOT_EDITABLE',
        error: `Messages with status '${message.status}' cannot be edited.`,
      };
    }
  }

  // 6. If linked to an ai_action, verify it belongs to the same workspace
  if (message.ai_action_id) {
    const { data: action } = await supabase
      .from('ai_actions')
      .select('id, workspace_id')
      .eq('id', message.ai_action_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!action) {
      return {
        success: false,
        code: 'CROSS_WORKSPACE_REFERENCE',
        error: 'Linked AI action does not belong to this workspace.',
      };
    }
  }

  // 7. Insert new version (audit trail — never overwrites old versions)
  const versionResult = await insertMessageVersion(
    workspaceId,
    messageId,
    trimmed,
    userId,
    changeReason || 'Human edit'
  );

  if (!versionResult.success) {
    if (versionResult.code === 'VERSION_CONFLICT') {
      return {
        success: false,
        code: 'VERSION_CONFLICT',
        error: 'Another edit was saved concurrently. Please reload and try again.',
      };
    }
    return { success: false, code: 'DATABASE_ERROR', error: 'Failed to save version history.' };
  }

  // 8. Update outreach_messages.content (authoritative active content)
  const { error: updateError } = await supabase
    .from('outreach_messages')
    .update({
      content: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('workspace_id', workspaceId);

  if (updateError) {
    console.error('Error updating outreach message:', updateError.message);
    return { success: false, code: 'DATABASE_ERROR', error: 'Failed to update message content.' };
  }

  // 9. Log activity
  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'outreach_message',
      entity_id: messageId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'message_content_edited',
      metadata: {
        version_number: versionResult.version?.version_number ?? null,
        change_reason: changeReason,
      },
    });
  } catch {
    // Non-critical
  }

  // 10. Revalidate
  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages/${messageId}`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages`, 'page');

  return { success: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// archiveOutreachMessageAction
// ──────────────────────────────────────────────────────────────────────────────

export async function archiveOutreachMessageAction(
  workspaceSlug: string,
  workspaceId: string,
  messageId: string
): Promise<ActionResult> {
  const { permitted, userId } = await checkManageLeadsPermission(workspaceId);
  if (!permitted || !userId) {
    return { success: false, code: 'FORBIDDEN', error: 'Permission denied. Requires manage_leads.' };
  }

  const supabase = await createClient();

  const { data: message } = await supabase
    .from('outreach_messages')
    .select('id, deleted_at')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!message) {
    return { success: false, code: 'NOT_FOUND', error: 'Message not found.' };
  }
  if (message.deleted_at !== null) {
    return { success: false, code: 'INVALID_STATUS', error: 'Message is already archived.' };
  }

  const { error } = await supabase
    .from('outreach_messages')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, code: 'DATABASE_ERROR', error: 'Failed to archive message.' };
  }

  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'outreach_message',
      entity_id: messageId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'message_archived',
      metadata: {},
    });
  } catch {
    // Non-critical
  }

  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages/${messageId}`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach`, 'page');

  return { success: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// restoreOutreachMessageAction
// ──────────────────────────────────────────────────────────────────────────────

export async function restoreOutreachMessageAction(
  workspaceSlug: string,
  workspaceId: string,
  messageId: string
): Promise<ActionResult> {
  const { permitted, userId } = await checkManageLeadsPermission(workspaceId);
  if (!permitted || !userId) {
    return { success: false, code: 'FORBIDDEN', error: 'Permission denied. Requires manage_leads.' };
  }

  const supabase = await createClient();

  const { data: message } = await supabase
    .from('outreach_messages')
    .select('id, deleted_at')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!message) {
    return { success: false, code: 'NOT_FOUND', error: 'Message not found.' };
  }
  if (message.deleted_at === null) {
    return { success: false, code: 'INVALID_STATUS', error: 'Message is not archived.' };
  }

  const { error } = await supabase
    .from('outreach_messages')
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, code: 'DATABASE_ERROR', error: 'Failed to restore message.' };
  }

  try {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'outreach_message',
      entity_id: messageId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'message_restored',
      metadata: {},
    });
  } catch {
    // Non-critical
  }

  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach/messages/${messageId}`, 'page');
  revalidatePath(`/dashboard/${workspaceSlug}/outreach`, 'page');

  return { success: true };
}
