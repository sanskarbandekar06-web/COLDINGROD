import 'server-only';

export function getAppUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredUrl && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_APP_URL must be set to the deployed HTTPS origin in production.',
    );
  }

  const rawUrl = configuredUrl || 'http://localhost:3000';
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.');
  }

  return parsedUrl.origin;
}
