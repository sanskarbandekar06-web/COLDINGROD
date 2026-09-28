import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'LinkedInBot',
        allow: '/',
      },
      {
        userAgent: '*',
        allow: ['/terms', '/privacy'],
        disallow: [
          '/api/',
          '/auth/',
          '/dashboard/',
          '/invite/',
          '/login',
          '/signup',
        ],
      },
    ],
  };
}
