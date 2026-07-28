'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addNote(workspaceId: string, entityType: string, entityId: string, content: string) {
  const supabase = await createClient();
  
  if (!content.trim()) {
    return { error: 'Note content cannot be empty' };
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { error: 'Unauthorized' };
  }

  const { error } = await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: entityType,
    entity_id: entityId,
    actor_type: 'human',
    actor_user_id: authData.user.id,
    action: 'note',
    metadata: { 
      content,
      edited: false,
      createdFrom: entityType
    }
  });

  if (error) {
    console.error('Error creating note:', error);
    return { error: 'Failed to create note.' };
  }

  revalidatePath(`/dashboard/[workspaceSlug]/${entityType}s/[id]`, 'page');
  return { success: true };
}

export async function deleteNote(activityId: string, workspaceId: string, entityType: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .eq('workspace_id', workspaceId)
    .eq('action', 'note');

  if (error) return { error: 'Failed to delete note' };

  revalidatePath(`/dashboard/[workspaceSlug]/${entityType}s/[id]`, 'page');
  return { success: true };
}
