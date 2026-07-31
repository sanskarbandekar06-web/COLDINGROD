import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';
import type { Activity } from '@/types/lead';

export const getClientActivities = cache(async (workspaceId: string, clientId: string) => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      actor_user:users!actor_user_id(id, full_name, email, avatar_url)
    `)
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'client')
    .eq('entity_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client activities:', error);
    throw new Error('Failed to fetch client activities');
  }

  return data as unknown as Activity[];
});
