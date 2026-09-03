import { buildLeadDossierDocx } from '@/lib/lead-dossier-docx';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function latestByLead(rows) {
  const latest = new Map();
  for (const row of rows ?? []) {
    if (!latest.has(row.lead_id)) latest.set(row.lead_id, row);
  }
  return latest;
}

export async function GET(request, { params }) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) return Response.json({ error: 'Workspace not found.' }, { status: 404 });
  if (!context.permissions.includes('manage_leads')) {
    return Response.json({ error: 'Lead management permission is required.' }, { status: 403 });
  }

  const ids = [...new Set(
    new URL(request.url).searchParams
      .getAll('leadId')
      .map((value) => value.trim())
      .filter((value) => UUID_PATTERN.test(value)),
  )].slice(0, 50);
  if (!ids.length) {
    return Response.json({ error: 'Select at least one valid lead.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id, company_name, status, source, website_url, industry, location, business_email, business_phone, created_at')
    .eq('workspace_id', context.workspace.id)
    .in('id', ids)
    .is('deleted_at', null);
  if (leadError) {
    console.error('Lead dossier lead query failed:', leadError.message);
    return Response.json({ error: 'Selected leads could not be loaded.' }, { status: 500 });
  }

  const availableIds = (leads ?? []).map((lead) => lead.id);
  if (!availableIds.length) {
    return Response.json({ error: 'No selected leads are available in this workspace.' }, { status: 404 });
  }

  const [contactsResult, reportsResult, scoresResult, referencesResult] = await Promise.all([
    supabase
      .from('lead_contacts')
      .select('id, lead_id, first_name, last_name, job_title, is_primary, email, phone, linkedin_url, instagram_handle, facebook_url, created_at')
      .in('lead_id', availableIds)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('lead_research_reports')
      .select('id, lead_id, research_summary, source_urls, pain_points, confidence, created_at')
      .eq('workspace_id', context.workspace.id)
      .in('lead_id', availableIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('lead_scores')
      .select('lead_id, score, scored_at')
      .in('lead_id', availableIds)
      .order('scored_at', { ascending: false }),
    supabase
      .from('lead_external_references')
      .select('lead_id, provider, external_id')
      .eq('workspace_id', context.workspace.id)
      .in('lead_id', availableIds),
  ]);

  const queryError = contactsResult.error || reportsResult.error || scoresResult.error || referencesResult.error;
  if (queryError) {
    console.error('Lead dossier detail query failed:', queryError.message);
    return Response.json({ error: 'Lead dossier details could not be loaded.' }, { status: 500 });
  }

  const contactsByLead = new Map(availableIds.map((id) => [id, []]));
  for (const contact of contactsResult.data ?? []) contactsByLead.get(contact.lead_id)?.push(contact);
  const reportsByLead = latestByLead(reportsResult.data);
  const scoresByLead = latestByLead(scoresResult.data);
  const placeByLead = new Map(
    (referencesResult.data ?? [])
      .filter((reference) => reference.provider === 'google_places')
      .map((reference) => [reference.lead_id, reference.external_id]),
  );
  const order = new Map(ids.map((id, index) => [id, index]));
  const dossierLeads = (leads ?? [])
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    .map((lead) => ({
      ...lead,
      score: scoresByLead.get(lead.id)?.score ?? null,
      google_place_id: placeByLead.get(lead.id) ?? null,
      contacts: contactsByLead.get(lead.id) ?? [],
      report: reportsByLead.get(lead.id) ?? null,
    }));

  const buffer = await buildLeadDossierDocx({
    workspaceName: context.workspace.name,
    preparedBy: context.user.fullName || context.user.email,
    generatedAt: new Date(),
    leads: dossierLeads,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="coldingrod-confirmed-leads-${date}.docx"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
