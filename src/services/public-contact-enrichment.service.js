import 'server-only';

import { discoverPublicBusinessProfile } from '@/lib/public-business-profile';
import { normalizePublicPhone, publicCountry } from '@/lib/public-contact-extractor';
import { searchPublicBusinessSources } from '@/lib/public-business-search';

const MAX_PROFILE_SOURCES = 5;

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
    'phoneType',
    'whatsappNumber',
    'whatsappSourceUrl',
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
  target.owners = [...(target.owners ?? []), ...(source.owners ?? [])]
    .filter((owner, index, all) => all.findIndex((other) => other.name.toLowerCase() === owner.name.toLowerCase()) === index).slice(0,5);
  target.contactEvidence = [...(target.contactEvidence ?? []), ...(source.contactEvidence ?? [])].slice(0,80);
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
    .or(`imported_lead_id.eq.${lead.id},matched_lead_id.eq.${lead.id}`)
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
    urls.map((url) => discoverPublicBusinessProfile(url, lead.company_name, lead.location)),
  );
  for (const result of profiles) {
    if (result.status === 'fulfilled') mergeProfile(aggregate, result.value);
  }
  if (!aggregate.whatsappNumber || !aggregate.owners?.length) {
    const search = await searchPublicBusinessSources(lead);
    aggregate.searchStatus = search.status;
    const extra = await Promise.allSettled(search.urls.filter((url) => !urls.includes(url) && !isGoogleMapsUrl(url))
      .slice(0,4).map((url) => discoverPublicBusinessProfile(url, lead.company_name, lead.location)));
    for (const item of extra) if (item.status === 'fulfilled' && item.value.officialWebsite) mergeProfile(aggregate, item.value);
  }
  const parsed = normalizePublicPhone(aggregate.phone, publicCountry(lead.location, lead.website_url));
  aggregate.phone = parsed?.number ?? aggregate.phone;
  aggregate.phoneType = parsed?.type ?? 'unknown';
  return aggregate;
}

/**
 * Best-effort repair for older leads created before discovery contact details
 * were carried into lead_contacts. RLS remains the final authorization layer.
 */
export async function enrichLeadPublicContact(supabase, lead, observedProfile = null) {
  const profile = observedProfile ?? await discoverLeadPublicContactProfile(supabase, lead);
  const { data, error } = await supabase.rpc('save_public_contact_research', {
    check_workspace_id: lead.workspace_id,
    check_lead_id: lead.id,
    profile_input: profile,
  });
  if (error) throw new Error(`Contact research could not be saved: ${error.message}`);
  return data ?? [];
}
