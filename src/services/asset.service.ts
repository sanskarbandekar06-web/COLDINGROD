import { createClient } from '@/lib/supabase/server';
import { Asset } from '@/types/asset';
import { cache } from 'react';

export const getEntityAssets = cache(async (workspaceId: string, entityType: string, entityId: string): Promise<Asset[]> => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Error fetching assets for ${entityType}:`, error);
    throw new Error(`Failed to fetch assets for ${entityType}`);
  }

  return data as Asset[];
});
