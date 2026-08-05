import { NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = getAppUrl();
  const next = safeNextPath(url.searchParams.get('next'));
  const providerError =
    url.searchParams.get('error_description') || url.searchParams.get('error');

  if (providerError) {
    return NextResponse.redirect(
      `${appUrl}/auth/auth-code-error?message=${encodeURIComponent(providerError)}`,
    );
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/auth/auth-code-error?message=${encodeURIComponent('The sign-in link is incomplete or expired.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${appUrl}/auth/auth-code-error?message=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${appUrl}${next}`);
}
