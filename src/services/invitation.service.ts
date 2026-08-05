import 'server-only';

import { createClient } from '@/lib/supabase/server';

export interface WorkspaceInvitation {
  id: string;
  email: string;
  token: string;
  grantedPermissions: string[];
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  isExpired: boolean;
  invitedBy: { fullName: string | null; email: string } | null;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getWorkspaceInvitations(
  workspaceId: string,
): Promise<WorkspaceInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_invites')
    .select(`
      id,
      email,
      token,
      granted_permissions,
      status,
      expires_at,
      accepted_at,
      revoked_at,
      created_at,
      invited_by_user:users!invited_by(full_name, email)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to load workspace invitations:', error);
    throw new Error('Failed to load workspace invitations.');
  }

  return (data ?? []).map((row) => {
    const actor = relationOne(row.invited_by_user);
    return {
      id: row.id,
      email: row.email,
      token: row.token,
      grantedPermissions: Array.isArray(row.granted_permissions)
        ? row.granted_permissions.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      isExpired: new Date(row.expires_at).getTime() <= Date.now(),
      invitedBy: actor
        ? { fullName: actor.full_name, email: actor.email }
        : null,
    };
  });
}
