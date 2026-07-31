const PUBLIC_ENV_ERROR =
  'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';

export function getSupabasePublicEnv(): {
  url: string;
  anonKey: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(PUBLIC_ENV_ERROR);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${PUBLIC_ENV_ERROR} NEXT_PUBLIC_SUPABASE_URL is invalid.`);
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error(`${PUBLIC_ENV_ERROR} The URL must use HTTP or HTTPS.`);
  }

  return {
    url: parsedUrl.toString().replace(/\/$/, ''),
    anonKey,
  };
}
