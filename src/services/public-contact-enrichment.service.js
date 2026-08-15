import 'server-only';

import { discoverPublicBusinessProfile } from '@/lib/public-business-profile';

const CONTACT_FIELDS =
  'id, first_name, last_name, email, phone, linkedin_url, instagram_handle, facebook_url';
const MAX_PROFILE_SOURCES = 5;

async function readContacts(supabase, leadId) {
  const { data, error } = await supabase
    .from('lead_contacts')
    .select(CONTACT_FIELDS)
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false });
  if (error) throw new Error(`Contact read failed: ${error.message}`);
  return data ?? [];
}

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value)
    ? value.trim()
    : null;
}

function isGoogleMapsUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) &&
      url.pathname.toLowerCase().startsWith('/maps');
  } catch {
    return false;
  }
}

function emptyProfile() {
  return {
    websiteAnalyzed: false,
    officialWebsite: false,
    businessNameMatched: false,
    hasClearCta: null,
    hasOnlineBooking: null,
    seoStatus: 'unknown',
    sourceUrls: [],
  };
}

function mergeProfile(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const field of [
    'phone',
    'email',
    'linkedinUrl',
    'instagramHandle',
    'facebookUrl',
  ]) {
    if (!target[field] && source[field]) target[field] = source[field];
  }
  const sourceIsStronger = Boolean(source.officialWebsite) && !target.officialWebsite;
  if ((!target.pageTitle || sourceIsStronger) && source.pageTitle) {
    target.pageTitle = source.pageTitle;
  }
  if ((!target.description || sourceIsStronger) && source.description) {
    target.description = source.description;
  }
  if ((!target.finalUrl || sourceIsStronger) && source.finalUrl) {
    target.finalUrl = source.finalUrl;
  }
  target.websiteAnalyzed = Boolean(target.websiteAnalyzed || source.websiteAnalyzed);
  target.officialWebsite = Boolean(target.officialWebsite || source.officialWebsite);
  target.businessNameMatched = Boolean(
    target.businessNameMatched || source.businessNameMatched,
  );
  if (source.hasClearCta !== null && source.hasClearCta !== undefined) {
    target.hasClearCta = Boolean(target.hasClearCta || source.hasClearCta);
  }
  if (source.hasOnlineBooking !== null && source.hasOnlineBooking !== undefined) {
    target.hasOnlineBooking = Boolean(
      target.hasOnlineBooking || source.hasOnlineBooking,
    );
  }
  const seoRank = { unknown: 0, weak: 1, average: 2, strong: 3 };
  if ((seoRank[source.seoStatus] ?? 0) > (seoRank[target.seoStatus] ?? 0)) {
    target.seoStatus = source.seoStatus;
  }
  target.sourceUrls = [...new Set([
    ...(target.sourceUrls ?? []),
    ...(source.sourceUrls ?? []),
  ])].slice(0, 10);
  return target;
}

/**
 * Aggregates the stored lead, its imported discovery record, existing public
 * destinations, and every safe first-party/source page that can be verified.
 * Google Maps content itself is not persisted; the durable Place ID remains
 * the provider reference while independently verified website details are used.
 */
export async function discoverLeadPublicContactProfile(supabase, lead) {
  const aggregate = emptyProfile();
  const { data: candidates, error } = await supabase
    .from('lead_discovery_candidates')
    .select(
      'website_url, source_url, business_email, business_phone, linkedin_url, instagram_handle, facebook_url, created_at',
    )
    .eq('workspace_id', lead.workspace_id)
    .eq('imported_lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) console.error('Discovery source lookup failed:', error.message);

  const sourceCandidates = candidates ?? [];
  mergeProfile(aggregate, {
    phone: lead.business_phone || sourceCandidates.find((item) => item.business_phone)?.business_phone,
    email: lead.business_email || sourceCandidates.find((item) => item.business_email)?.business_email,
    linkedinUrl: sourceCandidates.find((item) => item.linkedin_url)?.linkedin_url,
    instagramHandle: sourceCandidates.find((item) => item.instagram_handle)?.instagram_handle,
    facebookUrl: sourceCandidates.find((item) => item.facebook_url)?.facebook_url,
    sourceUrls: sourceCandidates
      .flatMap((item) => [httpUrl(item.website_url), httpUrl(item.source_url)])
      .filter(Boolean),
  });

  const urls = [...new Set([
    httpUrl(lead.website_url),
    ...sourceCandidates.flatMap((item) => [
      httpUrl(item.website_url),
      httpUrl(item.source_url),
      httpUrl(item.linkedin_url),
      item.instagram_handle
        ? `https://www.instagram.com/${String(item.instagram_handle).replace(/^@/, '')}/`
        : null,
      httpUrl(item.facebook_url),
    ]),
  ].filter((url) => url && !isGoogleMapsUrl(url)))].slice(0, MAX_PROFILE_SOURCES);

  const profiles = await Promise.allSettled(
    urls.map((url) => discoverPublicBusinessProfile(url, lead.company_name)),
  );
  for (const result of profiles) {
    if (result.status === 'fulfilled') mergeProfile(aggregate, result.value);
  }
  return aggregate;
}

/**
 * Best-effort repair for older leads created before discovery contact details
 * were carried into lead_contacts. RLS remains the final authorization layer.
 */
export async function enrichLeadPublicContact(supabase, lead, observedProfile = null) {
  const existing = await readContacts(supabase, lead.id);
  const profile = observedProfile ??
    await discoverLeadPublicContactProfile(supabase, lead);
  const details = {
    phone: lead.business_phone ?? profile.phone ?? null,
    email: lead.business_email ?? profile.email ?? null,
    linkedinUrl: profile.linkedinUrl ?? null,
    instagramHandle: profile.instagramHandle ?? null,
    facebookUrl: profile.facebookUrl ?? null,
  };
  const hasReachableDetail = Boolean(
    details.phone || details.email || details.linkedinUrl ||
      details.instagramHandle || details.facebookUrl,
  );
  if (!hasReachableDetail) return existing;

  if ((!lead.business_phone && profile.phone) || (!lead.business_email && profile.email)) {
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        business_phone: lead.business_phone ?? profile.phone ?? null,
        business_email: lead.business_email ?? profile.email ?? null,
      })
      .eq('id', lead.id)
      .eq('workspace_id', lead.workspace_id)
      .is('deleted_at', null);
    if (leadError) throw new Error(`Lead contact update failed: ${leadError.message}`);
  }

  let contact = existing[0];
  if (!contact) {
    const { data, error: insertError } = await supabase
      .from('lead_contacts')
      .insert({
        lead_id: lead.id,
        first_name: lead.company_name,
        job_title: 'Business contact',
        is_primary: true,
        email: details.email,
        phone: details.phone,
        linkedin_url: details.linkedinUrl,
        instagram_handle: details.instagramHandle,
        facebook_url: details.facebookUrl,
      })
      .select(CONTACT_FIELDS)
      .single();
    if (insertError) throw new Error(`Contact enrichment failed: ${insertError.message}`);
    contact = data ?? null;
  } else {
    const { error: updateError } = await supabase
      .from('lead_contacts')
      .update({
        email: contact.email ?? details.email,
        phone: contact.phone ?? details.phone,
        linkedin_url: contact.linkedin_url ?? details.linkedinUrl,
        instagram_handle: contact.instagram_handle ?? details.instagramHandle,
        facebook_url: contact.facebook_url ?? details.facebookUrl,
      })
      .eq('id', contact.id)
      .eq('lead_id', lead.id);
    if (updateError) throw new Error(`Contact enrichment failed: ${updateError.message}`);
  }

  return readContacts(supabase, lead.id);
}
