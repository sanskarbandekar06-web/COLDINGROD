'use server';

import { cookies } from 'next/headers';
import { isValidWorkspaceSlug } from '@/lib/workspace-slug';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';

export async function setLastActiveWorkspace(slug: string): Promise<void> {
  if (!isValidWorkspaceSlug(slug)) {
    throw new Error('Invalid workspace slug.');
  }

  const context = await getWorkspaceContext(slug);
  if (!context) {
    throw new Error('Workspace not found or unavailable.');
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('activate_user_workspace_context', {
    check_workspace_id: context.workspace.id,
  });
  if (error) {
    console.error('Workspace connection context update failed:', error.message);
    throw new Error('Workspace connections could not be updated.');
  }

  const cookieStore = await cookies();
  cookieStore.set('last_active_workspace_slug', slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
