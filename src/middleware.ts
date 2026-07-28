import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Update session and get user info
  const { supabaseResponse, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Public paths that don't require auth
  const isPublicPath = path === '/login' || path === '/signup' || path === '/' || path.startsWith('/auth/callback');

  if (!user && !isPublicPath) {
    // Redirect to login if accessing private path without auth
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return Response.redirect(loginUrl);
  }

  if (user && isPublicPath && path !== '/') {
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
