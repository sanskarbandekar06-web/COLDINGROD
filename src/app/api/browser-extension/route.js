import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { discoverPublicBusinessProfile } from '@/lib/public-business-profile';
import { generateGroundedOutreachDraft } from '@/lib/outreach-message-generator';
import {
  buildAutomaticEvidence,
  opportunityFromAutomaticProfile,
} from '@/services/automatic-lead-intelligence.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_PATTERN = /^cgr_[A-Za-z0-9_-]{43}$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;
const MAX_BODY_BYTES = 30_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI_PLATFORMS = new Set(['email', 'linkedin', 'whatsapp', 'instagram', 'sms']);
const AI_TONES = new Set(['concise', 'consultative', 'warm']);
const AI_GOALS = new Set(['book_call', 'offer_audit', 'share_idea']);

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

function contactChannelCount(contacts) {
  const channels = new Set();
  for (const contact of contacts ?? []) {
    if (contact.email) channels.add('email');
    if (contact.phone) {
      channels.add('whatsapp');
      channels.add('sms');
    }
    if (contact.linkedin_url) channels.add('linkedin');
    if (contact.instagram_handle) channels.add('instagram');
    if (contact.facebook_url) channels.add('facebook');
  }
  return channels.size;
}

async function getExtensionBasis(supabase, hashedToken, leadId) {
  const { data, error } = await supabase.rpc(
    'browser_extension_get_outreach_basis',
    { check_token_hash: hashedToken, check_lead_id: leadId },
  );
  if (error) throw error;
  return data;
}

async function ensureExtensionBasis(supabase, hashedToken, leadId) {
  let basis = await getExtensionBasis(supabase, hashedToken, leadId);
  const lead = basis?.lead;
  if (!lead) throw new Error('Lead outreach basis is unavailable.');
  const shouldInspectWebsite = Boolean(lead.website_url) &&
    (!basis.report || contactChannelCount(basis.contacts) < 2);
  const profile = shouldInspectWebsite
    ? await discoverPublicBusinessProfile(lead.website_url, lead.company_name)
    : {
        websiteAnalyzed: false,
        officialWebsite: false,
        businessNameMatched: false,
        hasClearCta: null,
        hasOnlineBooking: null,
        seoStatus: 'unknown',
        sourceUrls: [],
      };

  if (!basis.report || shouldInspectWebsite) {
    const evidence = buildAutomaticEvidence(lead, profile, basis.contacts ?? []);
    const { error } = await supabase.rpc(
      'browser_extension_prepare_lead_intelligence',
      {
        check_token_hash: hashedToken,
        check_lead_id: leadId,
        input_signals: evidence.signals,
        research_input: evidence.research,
        contact_input: {
          email: profile.email ?? null,
          phone: profile.phone ?? null,
          linkedin_url: profile.linkedinUrl ?? null,
          instagram_handle: profile.instagramHandle ?? null,
          facebook_url: profile.facebookUrl ?? null,
        },
      },
    );
    if (error) throw error;
    basis = await getExtensionBasis(supabase, hashedToken, leadId);
  }
  return { basis, profile };
}

function mergeBasisIntoContext(context, basis) {
  if (!context?.selected_lead || !basis?.lead) return context;
  const contacts = basis.contacts ?? [];
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  return {
    ...context,
    selected_lead: {
      ...context.selected_lead,
      ...basis.lead,
      contacts,
      report: basis.report,
    },
    messages: (context.messages ?? []).map((message) => ({
      ...message,
      ...(contactsById.get(message.contact_id) ?? {}),
    })),
  };
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

  if (body.action === 'suggest_draft') {
    const leadId = typeof body.leadId === 'string' ? body.leadId : '';
    const contactId = typeof body.contactId === 'string' ? body.contactId : '';
    const platform = typeof body.platform === 'string' ? body.platform.toLowerCase() : '';
    const tone = typeof body.tone === 'string' ? body.tone.toLowerCase() : '';
    const goal = typeof body.goal === 'string' ? body.goal.toLowerCase() : '';
    if (!UUID_PATTERN.test(leadId) || !UUID_PATTERN.test(contactId) ||
      !AI_PLATFORMS.has(platform) || !AI_TONES.has(tone) || !AI_GOALS.has(goal)) {
      return json(
        request,
        { code: 'INVALID_INPUT', error: 'Choose a valid lead, contact, channel, tone, and goal.' },
        400,
      );
    }

    const { data: context, error: contextError } = await supabase.rpc(
      'browser_extension_get_context',
      {
        check_token_hash: hashedToken,
        check_page_url: typeof body.pageUrl === 'string' ? body.pageUrl : null,
        check_page_title: typeof body.pageTitle === 'string' ? body.pageTitle : null,
        check_lead_id: leadId,
      },
    );
    if (contextError) {
      const mapped = mapDatabaseError(contextError);
      return json(request, { code: mapped.code, error: mapped.error }, mapped.status);
    }
    if (!context?.permissions?.includes('manage_ai') ||
      !context?.permissions?.includes('manage_leads')) {
      return json(
        request,
        { code: 'PERMISSION_DENIED', error: 'AI and lead management permissions are required.' },
        403,
      );
    }

    let prepared;
    try {
      prepared = await ensureExtensionBasis(supabase, hashedToken, leadId);
    } catch (basisError) {
      const mapped = mapDatabaseError(basisError);
      return json(request, { code: mapped.code, error: mapped.error }, mapped.status);
    }
    const lead = prepared.basis?.lead;
    const contact = prepared.basis?.contacts?.find((item) => item.id === contactId);
    if (!lead || !contact) {
      return json(
        request,
        { code: 'INVALID_INPUT', error: 'The selected lead or contact is unavailable.' },
        400,
      );
    }
    const reachable =
      (platform === 'email' && contact.email) ||
      (platform === 'linkedin' && contact.linkedin_url) ||
      (platform === 'instagram' && contact.instagram_handle) ||
      ((platform === 'whatsapp' || platform === 'sms') && contact.phone);
    if (!reachable) {
      return json(
        request,
        { code: 'INVALID_INPUT', error: 'This contact is not reachable on the selected channel.' },
        400,
      );
    }

    const profile = prepared.profile;
    const report = prepared.basis.report;
    const painPoints = Array.isArray(report?.pain_points) ? report.pain_points : [];
    const reportOpportunity = painPoints.find((point) =>
      point && typeof point.service_opportunity === 'string' &&
      point.service_opportunity.trim(),
    )?.service_opportunity;
    const opportunity = reportOpportunity ||
      opportunityFromAutomaticProfile(lead, profile);
    const previousMessages = (prepared.basis.recent_messages ?? [])
      .filter((message) => message.platform === platform)
      .map((message) => message.content);
    const draft = await generateGroundedOutreachDraft({
      platform,
      tone,
      goal,
      lead,
      contact,
      opportunity,
      executiveSummary: report?.research_summary ?? {},
      detailedAnalysis: painPoints,
      sourceUrls: report?.source_urls ?? [],
      avoidMessages: previousMessages,
    });
    return json(request, {
      data: {
        ...draft,
        opportunity,
        analysis: {
          officialWebsite: Boolean(profile.officialWebsite),
          availableSources: report?.source_urls?.length ?? profile.sourceUrls?.length ?? 0,
          reportId: report?.id ?? null,
          reportConfidence: report?.confidence ?? null,
          groundedInBothReports: Boolean(report),
          unknownsPreserved: true,
        },
      },
    });
  }

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

  if (body.action === 'context' && data?.selected_lead?.id) {
    try {
      const prepared = await ensureExtensionBasis(
        supabase,
        hashedToken,
        data.selected_lead.id,
      );
      return json(request, {
        data: mergeBasisIntoContext(data, prepared.basis),
      });
    } catch (basisError) {
      console.error('Browser companion enrichment failed:', basisError?.message);
    }
  }

  return json(request, { data });
}
