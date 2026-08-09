import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrichLeadPublicContact } from '@/services/public-contact-enrichment.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * GET /api/outreach/contacts?leadId=...&workspaceId=...
 *
 * Validates:
 * 1. User is authenticated
 * 2. workspaceId matches the lead's workspace_id (prevents cross-workspace leakage)
 * 3. leadId belongs to the workspace
 *
 * Returns minimal contact fields — no sensitive data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const leadId = searchParams.get('leadId')?.trim();
  const workspaceId = searchParams.get('workspaceId')?.trim();

  if (!leadId || !workspaceId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate lead belongs to the workspace
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Validate user is a member of this workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: contacts }, { data: score }, { data: report }] =
    await Promise.all([
      supabase
        .from('lead_contacts')
        .select(
          'id, first_name, last_name, email, phone, linkedin_url, instagram_handle, facebook_url',
        )
        .eq('lead_id', leadId)
        .order('is_primary', { ascending: false }),
      supabase
        .from('lead_scores')
        .select('id')
        .eq('lead_id', leadId)
        .order('scored_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('lead_research_reports')
        .select('id, pain_points')
        .eq('workspace_id', workspaceId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const painPoints = Array.isArray(report?.pain_points)
    ? report.pain_points
    : [];
  const hasOpportunity = painPoints.some(
    (point) =>
      point &&
      typeof point === 'object' &&
      'service_opportunity' in point &&
      typeof point.service_opportunity === 'string' &&
      point.service_opportunity.trim().length > 0,
  );

  return NextResponse.json({
    contacts: contacts ?? [],
    readiness: {
      qualified: Boolean(score),
      researched: Boolean(report),
      hasOpportunity,
    },
  });
}

/**
 * POST /api/outreach/contacts
 *
 * Repairs a pre-enrichment lead from its verified public business website.
 * This is intentionally a POST because it may persist newly found details.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const leadId =
    body && typeof body === 'object' && 'leadId' in body ? body.leadId : null;
  const workspaceId =
    body && typeof body === 'object' && 'workspaceId' in body
      ? body.workspaceId
      : null;
  if (!isUuid(leadId) || !isUuid(workspaceId)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [{ data: permitted }, { data: lead }] = await Promise.all([
    supabase.rpc('has_workspace_permission', {
      check_workspace_id: workspaceId,
      req_permission: 'manage_leads',
    }),
    supabase
      .from('leads')
      .select(
        'id, workspace_id, company_name, website_url, business_email, business_phone',
      )
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  if (!permitted) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const contacts = await enrichLeadPublicContact(supabase, lead);
  return NextResponse.json(contacts);
}
