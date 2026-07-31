import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Update session and get user info
  const { supabaseResponse, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const isAuthPath = path === '/login' || path === '/signup';
  const isPublicPath =
    isAuthPath ||
    path === '/' ||
    path === '/terms' ||
    path === '/privacy' ||
    path === '/robots.txt' ||
    path === '/api/health' ||
    path.startsWith('/auth/callback') ||
    path.startsWith('/invite/');

  if (!user && !isPublicPath) {
    // Redirect to login if accessing private path without auth
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return Response.redirect(loginUrl);
  }

  if (user && isAuthPath) {
    // Redirect to dashboard if accessing auth pages while logged in
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return Response.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
