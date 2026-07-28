'use server';

import { createClient } from '@/lib/supabase/server';

export async function getClientDrawerData(workspaceId: string, clientId: string) {
  const supabase = await createClient();
  
  const [
    { data: client },
    { data: projects },
    { data: meetings },
    { data: activities }
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .single(),
    supabase
      .from('projects')
      .select('id, name, status, created_at')
      .eq('client_id', clientId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('meetings')
      .select('id, title, start_time, status')
      .eq('client_id', clientId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('start_time', { ascending: false })
      .limit(3),
    supabase
      .from('activities')
      .select('id, action, created_at, actor_user:users!actor_user_id(full_name)')
      .eq('entity_id', clientId)
      .eq('entity_type', 'client')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(3)
  ]);

  return {
    client,
    projects: projects || [],
    meetings: meetings || [],
    activities: activities || []
  };
}
