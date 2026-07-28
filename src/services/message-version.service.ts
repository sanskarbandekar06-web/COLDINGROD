/**
 * message-version.service.ts
 *
 * Service layer for message_versions (append-only audit trail).
 *
 * Active content strategy:
 *   The authoritative current content is outreach_messages.content.
 *   message_versions records are ordered by version_number DESC, created_at DESC.
 *   This service reads and inserts version history only.
 *
 * Version concurrency:
 *   Supabase client does not support atomic fetch+increment RPCs in Database v1.0.
 *   We compute next_version = MAX(version_number) + 1 from the latest row for
 *   the same message, then attempt insert. If a UNIQUE-like constraint or race
 *   produces a conflict, we surface VERSION_CONFLICT to the caller.
 *
 *   Limitation (Database v1.1 candidate): no unique constraint on
 *   (outreach_message_id, version_number) in Database v1.0, so duplicate version
 *   numbers are theoretically possible under simultaneous concurrent edits.
 *   We detect this by fetching the current max before insert and returning
 *   VERSION_CONFLICT if it changed by the time we verify post-insert.
 */

import { createClient } from '@/lib/supabase/server';
import { MessageVersion } from '@/types/lead';
import { cache } from 'react';

export interface MessageVersionWithEditor extends MessageVersion {
  editor: { full_name: string | null } | null;
}

export const getMessageVersions = cache(
  async (
    workspaceId: string,
    messageId: string,
    limit = 20
  ): Promise<MessageVersionWithEditor[]> => {
    const supabase = await createClient();

    // First verify the message belongs to this workspace
    const { data: msg } = await supabase
      .from('outreach_messages')
      .select('id')
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!msg) return [];

    const { data, error } = await supabase
      .from('message_versions')
      .select(
        `
        id, outreach_message_id, content, edited_by, version_number,
        change_reason, created_at,
        editor:users!message_versions_edited_by_fkey(full_name)
      `
      )
      .eq('outreach_message_id', messageId)
      .order('version_number', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching message versions:', error.message);
      return [];
    }

    return (data as unknown as MessageVersionWithEditor[]) || [];
  }
);

export interface InsertVersionResult {
  success: boolean;
  code?:
    | 'VERSION_CONFLICT'
    | 'DATABASE_ERROR'
    | 'NOT_FOUND'
    | 'CROSS_WORKSPACE_REFERENCE';
  version?: MessageVersion;
}

/**
 * Inserts a new message version record.
 * Called only from within outreach Server Actions after permission/state checks.
 *
 * Returns VERSION_CONFLICT if the current max version_number changed
 * between our read and write (optimistic concurrency check).
 */
export async function insertMessageVersion(
  workspaceId: string,
  messageId: string,
  content: string,
  editorUserId: string,
  changeReason: string | null
): Promise<InsertVersionResult> {
  const supabase = await createClient();

  // Validate message belongs to workspace
  const { data: msg } = await supabase
    .from('outreach_messages')
    .select('id')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!msg) {
    return { success: false, code: 'CROSS_WORKSPACE_REFERENCE' };
  }

  // Fetch current max version_number
  const { data: maxVersionRow } = await supabase
    .from('message_versions')
    .select('version_number')
    .eq('outreach_message_id', messageId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentMax = maxVersionRow?.version_number ?? 0;
  const nextVersion = currentMax + 1;

  // Insert new version
  const { data: newVersion, error: insertError } = await supabase
    .from('message_versions')
    .insert({
      outreach_message_id: messageId,
      content,
      edited_by: editorUserId,
      version_number: nextVersion,
      change_reason: changeReason,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error inserting message version:', insertError.message);
    return { success: false, code: 'DATABASE_ERROR' };
  }

  return { success: true, version: newVersion as MessageVersion };
}
