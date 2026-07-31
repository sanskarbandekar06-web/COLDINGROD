'use server';

import { cookies } from 'next/headers';

const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function setLastActiveWorkspace(slug: string): Promise<void> {
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) {
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
