import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';

  return NextResponse.json(
    {
      service: 'coldingrod',
      status: 'ok',
      deployment: {
        commit: commitSha === 'local' ? commitSha : commitSha.slice(0, 7),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'local',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
