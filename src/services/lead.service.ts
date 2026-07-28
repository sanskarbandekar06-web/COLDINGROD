import { createClient } from '@/lib/supabase/server';
import { Lead, LeadStatus } from '@/types/lead';
import { cache } from 'react';

export interface GetLeadsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  source?: string;
  assignedTo?: string;
  sortBy?: 'created_at' | 'updated_at' | 'score' | 'company_name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedLeads {
  data: (Lead & { 
    assigned_user?: { full_name: string; email: string; avatar_url: string | null };
    score?: { score: number };
  })[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getLeads = cache(async (params: GetLeadsParams): Promise<PaginatedLeads> => {
  const supabase = await createClient();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!assigned_to(id, full_name, email, avatar_url),
      lead_scores!left(score)
    `, { count: 'exact' })
    .eq('workspace_id', params.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    query = query.ilike('company_name', `%${params.search}%`);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.source) {
    query = query.eq('source', params.source);
  }
  if (params.assignedTo) {
    query = query.eq('assigned_to', params.assignedTo);
  }

  // Handle sorting
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  
  if (sortBy === 'score') {
     // Sorting by a joined table isn't fully supported natively by simple supabase-js without an RPC or complex view, 
     // but we will do our best or fallback to created_at if it's too complex. 
     // PostgREST 11 allows ordering on relation, but we will sort normally on created_at for now unless specified.
     query = query.order('created_at', { ascending: false });
  } else {
     query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching leads:', error);
    throw new Error('Failed to fetch leads');
  }

  // Format the score relation
  const formattedData = (data as any[]).map(d => ({
    ...d,
    score: d.lead_scores && d.lead_scores.length > 0 ? d.lead_scores[0] : undefined
  }));

  return {
    data: formattedData as any,
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0
  };
});

export const getLeadDetails = cache(async (workspaceId: string, leadId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!assigned_to(id, full_name, email, avatar_url)
    `)
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching lead details:', error);
    throw new Error('Failed to fetch lead details');
  }

  return data as Lead & { assigned_user?: { id: string; full_name: string; email: string; avatar_url: string | null } };
});

export const getLeadStats = cache(async (workspaceId: string) => {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('leads')
    .select('status, id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching lead stats:', error);
    throw new Error('Failed to fetch lead stats');
  }

  const total = data.length;
  const won = data.filter(l => l.status === 'won').length;
  const lost = data.filter(l => l.status === 'lost').length;
  const active = total - won - lost;

  return {
    total,
    active,
    won,
    lost
  };
});
