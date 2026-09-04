import { buildLeadDossierDocx } from '@/lib/lead-dossier-docx';
import { getGooglePlacePhone } from '@/lib/google-places-contact';
import { createClient } from '@/lib/supabase/server';
import { discoverLeadPublicContactProfile } from '@/services/public-contact-enrichment.service';
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

function firstPresent(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? null;
}

function contactPhone(contacts) {
  return firstPresent(...(contacts ?? []).map((contact) => contact.phone));
}

function contactEmail(contacts) {
  return firstPresent(...(contacts ?? []).map((contact) => contact.email));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
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

  const [
    contactsResult,
    reportsResult,
    scoresResult,
    referencesResult,
    importedCandidatesResult,
    matchedCandidatesResult,
  ] = await Promise.all([
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
    supabase
      .from('lead_discovery_candidates')
      .select('imported_lead_id, matched_lead_id, business_email, business_phone, linkedin_url, instagram_handle, facebook_url, created_at')
      .eq('workspace_id', context.workspace.id)
      .in('imported_lead_id', availableIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('lead_discovery_candidates')
      .select('imported_lead_id, matched_lead_id, business_email, business_phone, linkedin_url, instagram_handle, facebook_url, created_at')
      .eq('workspace_id', context.workspace.id)
      .in('matched_lead_id', availableIds)
      .order('created_at', { ascending: false }),
  ]);

  const queryError = contactsResult.error || reportsResult.error || scoresResult.error ||
    referencesResult.error || importedCandidatesResult.error || matchedCandidatesResult.error;
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
  const discoveryByLead = new Map();
  for (const candidate of [
    ...(importedCandidatesResult.data ?? []),
    ...(matchedCandidatesResult.data ?? []),
  ]) {
    const leadId = candidate.imported_lead_id ?? candidate.matched_lead_id;
    if (!leadId) continue;
    const current = discoveryByLead.get(leadId) ?? {};
    discoveryByLead.set(leadId, {
      business_email: firstPresent(current.business_email, candidate.business_email),
      business_phone: firstPresent(current.business_phone, candidate.business_phone),
      linkedin_url: firstPresent(current.linkedin_url, candidate.linkedin_url),
      instagram_handle: firstPresent(current.instagram_handle, candidate.instagram_handle),
      facebook_url: firstPresent(current.facebook_url, candidate.facebook_url),
    });
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  const storedLeads = (leads ?? [])
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    .map((lead) => {
      const contacts = contactsByLead.get(lead.id) ?? [];
      const discovery = discoveryByLead.get(lead.id) ?? {};
      return {
        ...lead,
        business_email: firstPresent(lead.business_email, discovery.business_email),
        business_phone: firstPresent(
          lead.business_phone,
          discovery.business_phone,
        ),
        score: scoresByLead.get(lead.id)?.score ?? null,
        google_place_id: placeByLead.get(lead.id) ?? null,
        contacts,
        discovery_contact: discovery,
        report: reportsByLead.get(lead.id) ?? null,
      };
    });

  const profilesByLead = new Map();
  const missingContactLeads = storedLeads.filter((lead) =>
    (!lead.business_phone && !contactPhone(lead.contacts)) ||
    (!lead.business_email && !contactEmail(lead.contacts)),
  );
  await mapWithConcurrency(missingContactLeads, 6, async (lead) => {
    try {
      const profile = await discoverLeadPublicContactProfile(supabase, {
        ...lead,
        workspace_id: context.workspace.id,
      });
      profilesByLead.set(lead.id, profile);
    } catch (error) {
      console.error('Lead dossier contact recovery failed:', error instanceof Error ? error.message : error);
    }
  });

  const recoveredPhones = new Map();
  await Promise.all(storedLeads.map(async (lead) => {
    const profile = profilesByLead.get(lead.id);
    if (lead.business_phone || contactPhone(lead.contacts) || profile?.phone || !lead.google_place_id) return;
    const phone = await getGooglePlacePhone(lead.google_place_id);
    if (phone) recoveredPhones.set(lead.id, phone);
  }));
  const dossierLeads = storedLeads.map((lead) => {
    const profile = profilesByLead.get(lead.id) ?? {};
    return {
      ...lead,
      business_email: firstPresent(lead.business_email, profile.email),
      business_phone: firstPresent(
        lead.business_phone,
        profile.phone,
        recoveredPhones.get(lead.id),
      ),
      discovery_contact: {
        ...lead.discovery_contact,
        business_email: firstPresent(lead.discovery_contact?.business_email, profile.email),
        business_phone: firstPresent(lead.discovery_contact?.business_phone, profile.phone),
        linkedin_url: firstPresent(lead.discovery_contact?.linkedin_url, profile.linkedinUrl),
        instagram_handle: firstPresent(lead.discovery_contact?.instagram_handle, profile.instagramHandle),
        facebook_url: firstPresent(lead.discovery_contact?.facebook_url, profile.facebookUrl),
      },
    };
  });

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
