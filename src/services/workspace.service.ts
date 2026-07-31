import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Workspace } from '@/types/workspace';

export interface WorkspaceContextData {
  workspace: Workspace;
  permissions: string[];
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  member: { id: string };
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getWorkspaceContext = cache(
  async (slug: string): Promise<WorkspaceContextData | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (workspaceError || !workspace) return null;

    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select(`
        id,
        workspace_permissions(
          permissions(key)
        )
      `)
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (memberError || !member) return null;

    const permissions: string[] = [];
    for (const permissionRow of member.workspace_permissions ?? []) {
      const permission = relationOne(permissionRow.permissions);
      if (permission && typeof permission.key === 'string') {
        permissions.push(permission.key);
      }
    }

    const metadataName =
      typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === 'string'
          ? user.user_metadata.name
          : '';

    return {
      workspace,
      permissions,
      user: {
        id: user.id,
        email: user.email ?? '',
        fullName: metadataName,
      },
      member: { id: member.id },
    };
  },
);

export const getUserWorkspaces = cache(async (): Promise<Workspace[]> => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return [];

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(*)')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  if (error || !data) {
    console.error('Error fetching workspaces:', error);
    return [];
  }

  const workspaces: Workspace[] = [];
  for (const membership of data) {
    const workspace = relationOne(membership.workspaces);
    if (workspace) workspaces.push(workspace);
  }
  return workspaces;
});
