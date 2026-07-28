import 'server-only';

import { createClient } from '@/lib/supabase/server';

export interface MemberData {
  id: string;
  user_id: string;
  joined_at: string;
  user: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  permissions: string[];
}

export interface PermissionItem {
  id: string;
  key: string;
  description: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function relationOne(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isRecord(candidate) ? candidate : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseMember(value: unknown): MemberData | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const userId = stringValue(value.user_id);
  const joinedAt = stringValue(value.joined_at);
  const user = relationOne(value.users);
  const email = stringValue(user?.email);
  if (!id || !userId || !joinedAt || !email) return null;

  const permissions: string[] = [];
  const permissionRows = Array.isArray(value.workspace_permissions)
    ? value.workspace_permissions
    : [];
  for (const permissionRow of permissionRows) {
    if (!isRecord(permissionRow)) continue;
    const permission = relationOne(permissionRow.permissions);
    const key = stringValue(permission?.key);
    if (key) permissions.push(key);
  }

  return {
    id,
    user_id: userId,
    joined_at: joinedAt,
    user: {
      email,
      full_name: stringValue(user?.full_name),
      avatar_url: stringValue(user?.avatar_url),
    },
    permissions,
  };
}

function parsePermission(value: unknown): PermissionItem | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const key = stringValue(value.key);
  if (!id || !key) return null;
  return {
    id,
    key,
    description: stringValue(value.description),
  };
}

export async function getWorkspaceMembers(workspaceId: string): Promise<MemberData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      id,
      user_id,
      joined_at,
      users (
        email,
        full_name,
        avatar_url
      ),
      workspace_permissions (
        permissions (
          key
        )
      )
    `)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching members:', error);
    throw new Error('Failed to fetch workspace members.');
  }

  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows
    .map(parseMember)
    .filter((member): member is MemberData => member !== null);
}

export async function getAvailablePermissions(): Promise<PermissionItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('permissions')
    .select('id, key, description')
    .order('key');

  if (error) {
    console.error('Error fetching permissions:', error);
    throw new Error('Failed to fetch permissions.');
  }

  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows
    .map(parsePermission)
    .filter((permission): permission is PermissionItem => permission !== null);
}
