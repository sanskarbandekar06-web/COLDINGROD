import { NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

async function isGoogleProviderEnabled(): Promise<boolean | null> {
  try {
    const { url, anonKey } = getSupabasePublicEnv();
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const settings = (await response.json()) as {
      external?: { google?: boolean };
    };
    return settings.external?.google === true;
  } catch (error) {
    console.error('Could not read Supabase provider settings:', error);
    return null;
  }
}

export async function GET() {
  const appUrl = getAppUrl();
  const googleEnabled = await isGoogleProviderEnabled();
  if (googleEnabled === false) {
    return NextResponse.redirect(
      `${appUrl}/auth/auth-code-error?message=${encodeURIComponent(
        'Google sign-in is not enabled for this Supabase project yet. Ask the workspace administrator to finish the Google provider setup.',
      )}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    const message = error?.message || 'Google sign-in could not be started.';
    return NextResponse.redirect(
      `${appUrl}/auth/auth-code-error?message=${encodeURIComponent(message)}`,
    );
  }

  return NextResponse.redirect(data.url);
}
