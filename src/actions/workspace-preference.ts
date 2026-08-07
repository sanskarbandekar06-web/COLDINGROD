'use server';

import { cookies } from 'next/headers';
import { isValidWorkspaceSlug } from '@/lib/workspace-slug';

export async function setLastActiveWorkspace(slug: string): Promise<void> {
  if (!isValidWorkspaceSlug(slug)) {
    throw new Error('Invalid workspace slug.');
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
