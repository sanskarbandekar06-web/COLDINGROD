import { createClient } from '@/lib/supabase/server';
import { LeadContact } from '@/types/lead';
import { cache } from 'react';

export const getLeadContacts = cache(async (leadId: string): Promise<LeadContact[]> => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('lead_contacts')
    .select('*')
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching lead contacts:', error);
    throw new Error('Failed to fetch lead contacts');
  }

  return data as LeadContact[];
});
