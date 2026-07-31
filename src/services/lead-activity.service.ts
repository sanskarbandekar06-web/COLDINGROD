import { createClient } from '@/lib/supabase/server';
import { Activity } from '@/types/lead';
import { cache } from 'react';

export const getLeadActivities = cache(async (workspaceId: string, leadId: string): Promise<Activity[]> => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      actor_user:users!actor_user_id(id, full_name, email, avatar_url)
    `)
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'lead')
    .eq('entity_id', leadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching lead activities:', error);
    throw new Error('Failed to fetch lead activities');
  }

  return data as unknown as Activity[];
});
