import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Client } from '@/types/client';

export interface GetClientsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  industry?: string;
  archived?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedClients {
  data: Client[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getClients = cache(async (params: GetClientsParams): Promise<PaginatedClients> => {
  const supabase = await createClient();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(1000, Math.max(1, params.limit || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('workspace_id', params.workspaceId);

  query = params.archived
    ? query.not('deleted_at', 'is', null)
    : query.is('deleted_at', null);

  if (params.search) query = query.ilike('name', `%${params.search}%`);
  if (params.industry) query = query.eq('industry', params.industry);

  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error('Error fetching clients:', error);
    throw new Error('Failed to fetch clients');
  }

  return {
    data: data as Client[],
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

export const getClientDetails = cache(async (workspaceId: string, clientId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching client details:', error);
    throw new Error('Failed to fetch client details');
  }

  return data as Client;
});
