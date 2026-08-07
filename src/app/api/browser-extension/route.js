import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_PATTERN = /^cgr_[A-Za-z0-9_-]{43}$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;
const MAX_BODY_BYTES = 30_000;

function responseHeaders(request) {
  const origin = request.headers.get('origin');
  const allowedOrigin =
    origin && EXTENSION_ORIGIN_PATTERN.test(origin) ? origin : null;

  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(allowedOrigin
      ? { 'Access-Control-Allow-Origin': allowedOrigin }
      : {}),
    'Cache-Control': 'no-store, max-age=0',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function json(request, body, status = 200) {
  return Response.json(body, {
    status,
    headers: responseHeaders(request),
  });
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return null;

  const token = authorization.slice(7).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

function tokenHash(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createAnonymousClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'coldingrod-browser-companion-api',
      },
    },
  });
}

function mapDatabaseError(error) {
  const message = (error?.message ?? '').toLowerCase();

  if (error?.code === '28000' || message.includes('invalid, expired, or revoked')) {
    return {
      status: 401,
      code: 'CONNECTION_INVALID',
      error: 'This browser companion connection expired or was revoked.',
    };
  }
  if (error?.code === '42501' || message.includes('permission denied')) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      error: 'Your workspace permissions do not allow this action.',
    };
  }
  if (message.includes('rate limit')) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      error: 'Too many companion requests. Wait a moment and try again.',
    };
  }
  if (
    error?.code === '23505' ||
    error?.code === 'P0002' ||
    message.includes('already')
  ) {
    return {
      status: 409,
      code: 'CONFLICT',
      error: error?.message || 'This action was already completed.',
    };
  }
  if (error?.code === '22023') {
    return {
      status: 400,
      code: 'INVALID_INPUT',
      error: error?.message || 'The request is invalid.',
    };
  }

  return {
    status: 500,
    code: 'REQUEST_FAILED',
    error: 'The browser companion request could not be completed.',
  };
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (origin && !EXTENSION_ORIGIN_PATTERN.test(origin)) {
    return json(request, { error: 'Origin not allowed.' }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: responseHeaders(request),
  });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && !EXTENSION_ORIGIN_PATTERN.test(origin)) {
    return json(request, { error: 'Origin not allowed.' }, 403);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json(
      request,
      { code: 'INVALID_CONTENT_TYPE', error: 'JSON is required.' },
      415,
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(
      request,
      { code: 'PAYLOAD_TOO_LARGE', error: 'Request body is too large.' },
      413,
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return json(
      request,
      {
        code: 'CONNECTION_REQUIRED',
        error: 'A valid browser companion pairing key is required.',
      },
      401,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      request,
      { code: 'INVALID_JSON', error: 'The JSON request body is invalid.' },
      400,
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(
      request,
      { code: 'INVALID_INPUT', error: 'Request body must be an object.' },
      400,
    );
  }

  const hashedToken = tokenHash(token);
  const supabase = createAnonymousClient();
  let rpcName;
  let rpcArguments;

  switch (body.action) {
    case 'context':
      rpcName = 'browser_extension_get_context';
      rpcArguments = {
        check_token_hash: hashedToken,
        check_page_url:
          typeof body.pageUrl === 'string' ? body.pageUrl : null,
        check_page_title:
          typeof body.pageTitle === 'string' ? body.pageTitle : null,
        check_lead_id:
          typeof body.leadId === 'string' && body.leadId
            ? body.leadId
            : null,
      };
      break;
    case 'create_draft':
      rpcName = 'browser_extension_create_draft';
      rpcArguments = {
        check_token_hash: hashedToken,
        draft_input:
          body.draft && typeof body.draft === 'object' && !Array.isArray(body.draft)
            ? body.draft
            : null,
      };
      break;
    case 'decide_message':
      rpcName = 'browser_extension_decide_message';
      rpcArguments = {
        check_token_hash: hashedToken,
        check_message_id:
          typeof body.messageId === 'string' ? body.messageId : null,
        decision_value:
          typeof body.decision === 'string' ? body.decision : null,
        reason_value:
          typeof body.reason === 'string' ? body.reason : null,
      };
      break;
    case 'mark_sent':
      rpcName = 'browser_extension_mark_sent';
      rpcArguments = {
        check_token_hash: hashedToken,
        check_message_id:
          typeof body.messageId === 'string' ? body.messageId : null,
      };
      break;
    default:
      return json(
        request,
        { code: 'UNKNOWN_ACTION', error: 'Unknown companion action.' },
        400,
      );
  }

  const { data, error } = await supabase.rpc(rpcName, rpcArguments);
  if (error) {
    const mapped = mapDatabaseError(error);
    return json(
      request,
      { code: mapped.code, error: mapped.error },
      mapped.status,
    );
  }

  return json(request, { data });
}
