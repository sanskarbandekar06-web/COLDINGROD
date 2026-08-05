'use server';

import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { createClient } from '@/lib/supabase/server';

const ENTITY_PERMISSIONS = {
  lead: 'manage_leads',
  client: 'manage_clients',
  project: 'manage_projects',
} as const;

type NoteEntityType = keyof typeof ENTITY_PERMISSIONS;

export async function addNote(workspaceId: string, entityType: NoteEntityType, entityId: string, content: string) {
  const normalizedContent = content.trim();
  if (!normalizedContent || normalizedContent.length > 5000) {
    return { error: 'Note content must be between 1 and 5000 characters.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Authentication required.' };

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('workspace_permissions(permissions(key))')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (
    memberError ||
    !member ||
    !hasJoinedPermission(member.workspace_permissions, ['admin', ENTITY_PERMISSIONS[entityType]])
  ) {
    return { error: `Permission denied. Must have ${ENTITY_PERMISSIONS[entityType]} permission.` };
  }

  const table = entityType === 'lead' ? 'leads' : entityType === 'client' ? 'clients' : 'projects';
  const { data: entity } = await supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();
  if (!entity) return { error: `Active ${entityType} not found.` };

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: entityType,
    entity_id: entityId,
    actor_type: 'human',
    actor_user_id: user.id,
    action: 'note',
    metadata: { content: normalizedContent, edited: false, createdFrom: entityType },
  });

  if (error) {
    console.error('Error creating note:', error);
    return { error: 'Failed to create note.' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/${entityType}s/[id]`, 'page');
  return { success: true };
}
