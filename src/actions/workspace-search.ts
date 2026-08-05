'use server';

import { createClient } from '@/lib/supabase/server';

export interface WorkspaceSearchResult {
  id: string;
  type: 'Lead' | 'Client' | 'Project' | 'Task' | 'Meeting' | 'Asset';
  title: string;
  subtitle: string | null;
  href: string;
}

export async function searchWorkspaceAction({
  workspaceId,
  workspaceSlug,
  query,
}: {
  workspaceId: string;
  workspaceSlug: string;
  query: string;
}): Promise<{ results: WorkspaceSearchResult[]; error?: string }> {
  const normalized = query.trim().slice(0, 100);
  if (normalized.length < 2) return { results: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { results: [], error: 'Sign in to search this workspace.' };

  const [{ data: member }, { data: workspace }] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('slug', workspaceSlug)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (!member || !workspace) {
    return { results: [], error: 'Workspace access is required.' };
  }

  const searchText = normalized.replace(/[%,_]/g, '');
  if (searchText.length < 2) return { results: [] };
  const term = `%${searchText}%`;
  const [leads, clients, projects, tasks, meetings, assets] = await Promise.all([
    supabase.from('leads').select('id, company_name, status').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('company_name', term).limit(5),
    supabase.from('clients').select('id, name, industry').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('name', term).limit(5),
    supabase.from('projects').select('id, name, status').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('name', term).limit(5),
    supabase.from('tasks').select('id, title, status, project_id').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('title', term).limit(5),
    supabase.from('meetings').select('id, title, status').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('title', term).limit(5),
    supabase.from('assets').select('id, name, file_type').eq('workspace_id', workspaceId).is('deleted_at', null).ilike('name', term).limit(5),
  ]);

  const firstError = [leads, clients, projects, tasks, meetings, assets].find((result) => result.error)?.error;
  if (firstError) {
    console.error('Workspace search error:', firstError);
    return { results: [], error: 'Search is temporarily unavailable.' };
  }

  const base = `/dashboard/${workspaceSlug}`;
  return {
    results: [
      ...(leads.data ?? []).map((row) => ({ id: row.id, type: 'Lead' as const, title: row.company_name, subtitle: row.status, href: `${base}/leads/${row.id}` })),
      ...(clients.data ?? []).map((row) => ({ id: row.id, type: 'Client' as const, title: row.name, subtitle: row.industry, href: `${base}/clients/${row.id}` })),
      ...(projects.data ?? []).map((row) => ({ id: row.id, type: 'Project' as const, title: row.name, subtitle: row.status, href: `${base}/projects/${row.id}` })),
      ...(tasks.data ?? []).map((row) => ({ id: row.id, type: 'Task' as const, title: row.title, subtitle: row.status, href: row.project_id ? `${base}/projects/${row.project_id}` : `${base}/tasks?search=${encodeURIComponent(row.title)}` })),
      ...(meetings.data ?? []).map((row) => ({ id: row.id, type: 'Meeting' as const, title: row.title, subtitle: row.status, href: `${base}/meetings/${row.id}` })),
      ...(assets.data ?? []).map((row) => ({ id: row.id, type: 'Asset' as const, title: row.name, subtitle: row.file_type, href: `${base}/assets?search=${encodeURIComponent(row.name)}` })),
    ],
  };
}
