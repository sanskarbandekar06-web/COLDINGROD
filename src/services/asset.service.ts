import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  Asset,
  AssetRelationOptions,
  AssetStats,
  AssetWithUploader,
  GetAssetsParams,
  PaginatedAssets,
} from '@/types/asset';

type Uploader = AssetWithUploader['uploader'];

interface AssetQueryRow extends Asset {
  uploader: Uploader | Uploader[];
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getAssets = cache(
  async (params: GetAssetsParams): Promise<PaginatedAssets> => {
    const supabase = await createClient();
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('assets')
      .select(
        `
          *,
          uploader:users!assets_uploaded_by_fkey(full_name, email)
        `,
        { count: 'exact' },
      )
      .eq('workspace_id', params.workspaceId);

    query = params.archived
      ? query.not('deleted_at', 'is', null)
      : query.is('deleted_at', null);

    if (params.search?.trim()) {
      query = query.ilike('name', `%${params.search.trim()}%`);
    }

    if (params.source) {
      query = query.eq('upload_source', params.source);
    }

    switch (params.category) {
      case 'image':
        query = query.like('file_type', 'image/%');
        break;
      case 'video':
        query = query.like('file_type', 'video/%');
        break;
      case 'audio':
        query = query.like('file_type', 'audio/%');
        break;
      case 'archive':
        query = query.or(
          'file_type.ilike.%zip%,file_type.ilike.%compressed%,file_type.ilike.%archive%',
        );
        break;
      case 'document':
        query = query.or(
          'file_type.eq.application/pdf,file_type.like.text/%,file_type.ilike.%word%,file_type.ilike.%sheet%,file_type.ilike.%presentation%,file_type.ilike.%msword%,file_type.ilike.%ms-excel%,file_type.ilike.%ms-powerpoint%',
        );
        break;
      default:
        break;
    }

    const { data, count, error } = await query
      .order(params.archived ? 'deleted_at' : 'created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching assets:', error);
      throw new Error('Failed to fetch assets');
    }

    const assets = ((data ?? []) as AssetQueryRow[]).map(
      ({ uploader, ...asset }) => ({
        ...asset,
        uploader: relationOne(uploader),
      }),
    );

    return {
      data: assets,
      count: count ?? 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0,
    };
  },
);

export const getAssetStats = cache(
  async (workspaceId: string): Promise<AssetStats> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('assets')
      .select('size_bytes, file_type, deleted_at')
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('Error fetching asset statistics:', error);
      throw new Error('Failed to fetch asset statistics');
    }

    const rows = (data ?? []) as Pick<
      Asset,
      'size_bytes' | 'file_type' | 'deleted_at'
    >[];
    const active = rows.filter((asset) => !asset.deleted_at);

    return {
      activeFiles: active.length,
      archivedFiles: rows.length - active.length,
      totalBytes: active.reduce((total, asset) => total + asset.size_bytes, 0),
      imageFiles: active.filter((asset) => asset.file_type.startsWith('image/'))
        .length,
    };
  },
);

export const getAssetRelationOptions = cache(
  async (workspaceId: string): Promise<AssetRelationOptions> => {
    const supabase = await createClient();
    const [clientsResult, leadsResult, projectsResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('leads')
        .select('id, company_name')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('company_name'),
      supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('name'),
    ]);

    const error =
      clientsResult.error ?? leadsResult.error ?? projectsResult.error;
    if (error) {
      console.error('Error fetching asset relation options:', error);
      throw new Error('Failed to fetch asset relation options');
    }

    return {
      clients: (clientsResult.data ?? []).map((client) => ({
        id: client.id,
        label: client.name,
      })),
      leads: (leadsResult.data ?? []).map((lead) => ({
        id: lead.id,
        label: lead.company_name,
      })),
      projects: (projectsResult.data ?? []).map((project) => ({
        id: project.id,
        label: project.name,
      })),
    };
  },
);

export const getEntityAssets = cache(
  async (
    workspaceId: string,
    entityType: string,
    entityId: string,
  ): Promise<Asset[]> => {
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

    return (data ?? []) as Asset[];
  },
);
