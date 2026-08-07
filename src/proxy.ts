import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const isEntryAuthPath =
    path === '/login' || path === '/signup' || path === '/forgot-password';
  const isPublicPath =
    isEntryAuthPath ||
    path === '/reset-password' ||
    path === '/' ||
    path === '/terms' ||
    path === '/privacy' ||
    path === '/robots.txt' ||
    path === '/api/health' ||
    path === '/api/browser-extension' ||
    path === '/downloads/coldingrod-browser-companion.zip' ||
    path.startsWith('/auth/callback') ||
    path.startsWith('/auth/google') ||
    path.startsWith('/auth/auth-code-error') ||
    path.startsWith('/invite/');

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return Response.redirect(loginUrl);
  }

  if (user && isEntryAuthPath) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return Response.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
