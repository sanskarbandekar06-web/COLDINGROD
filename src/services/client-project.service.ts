import { createClient } from '@/lib/supabase/server';
import { Project } from '@/types/project';
import { cache } from 'react';

export const getClientProjects = cache(async (workspaceId: string, clientId: string): Promise<Project[]> => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client projects:', error);
    throw new Error('Failed to fetch client projects');
  }

  return data as Project[];
});
