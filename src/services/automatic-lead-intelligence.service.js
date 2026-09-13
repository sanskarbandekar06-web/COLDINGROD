import 'server-only';
import { supportsContactChannel } from '@/lib/contact-channels';

import {
  discoverLeadPublicContactProfile,
  enrichLeadPublicContact,
} from '@/services/public-contact-enrichment.service';

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function reportHasOpportunity(report) {
  return Array.isArray(report?.pain_points) && report.pain_points.some(
    (point) => record(point) &&
      typeof point.service_opportunity === 'string' &&
      point.service_opportunity.trim().length > 0,
  );
}

function socialPresent(contacts, profile) {
  return Boolean(
    profile.linkedinUrl || profile.instagramHandle || profile.facebookUrl ||
    contacts.some((contact) =>
      contact.linkedin_url || contact.instagram_handle || contact.facebook_url),
  );
}

function availableChannels(contacts, profile) {
  const channels = new Set();
  if (profile.email || contacts.some((contact) => contact.email)) channels.add('Email');
  if (profile.whatsappNumber || contacts.some((contact) => supportsContactChannel(contact, 'whatsapp'))) channels.add('WhatsApp');
  if (contacts.some((contact) => supportsContactChannel(contact, 'sms'))) channels.add('SMS');
  if (profile.linkedinUrl || contacts.some((contact) => contact.linkedin_url)) {
    channels.add('LinkedIn');
  }
  if (profile.instagramHandle || contacts.some((contact) => contact.instagram_handle)) {
    channels.add('Instagram');
  }
  if (profile.facebookUrl || contacts.some((contact) => contact.facebook_url)) {
    channels.add('Facebook');
  }
  return [...channels];
}

export function buildAutomaticEvidence(lead, profile, contacts) {
  const hasWebsite = Boolean(lead.website_url || profile.websiteAnalyzed);
  const verifiedWebsite = Boolean(profile.officialWebsite);
  const hasSocial = socialPresent(contacts, profile);
  const channels = availableChannels(contacts, profile);
  const websiteStatus = !verifiedWebsite
    ? 'unknown'
    : (profile.seoStatus !== 'weak' || profile.hasClearCta)
      ? 'good'
      : 'poor';
  // A profile link does not prove recent activity; a failed fetch proves no defect.
  const socialStatus = 'unknown';
  const seoStatus = verifiedWebsite ? profile.seoStatus : 'unknown';
  const hasClearCta = verifiedWebsite ? Boolean(profile.hasClearCta) : undefined;
  const hasOnlineBooking = verifiedWebsite
    ? Boolean(profile.hasOnlineBooking)
    : undefined;

  const observations = [];
  if (!hasWebsite) {
    observations.push('No owned website URL is stored for this lead.');
  } else if (verifiedWebsite) {
    observations.push(
      `The public website matched the business identity and was analyzed${profile.pageTitle ? ` (${profile.pageTitle})` : ''}.`,
    );
  } else if (profile.websiteAnalyzed) {
    observations.push(
      'The stored URL loaded, but its page identity did not verify it as the business’s owned website.',
    );
  } else {
    observations.push(
      'The stored website could not be verified during this public analysis run.',
    );
  }
  observations.push(
    hasSocial
      ? 'At least one public social destination is available.'
      : 'No public social destination was found in the stored profile or verified website.',
  );
  observations.push(
    !verifiedWebsite ? 'Website calls to action could not be assessed.' : hasClearCta
      ? 'A clear customer call to action was observed.'
      : 'No clear customer call to action was observed on the verified public website.',
  );
  observations.push(
    !verifiedWebsite ? 'Online booking could not be assessed.' : hasOnlineBooking
      ? 'An online booking or scheduling path was observed.'
      : 'No online booking or scheduling path was observed.',
  );
  observations.push(
    channels.length
      ? `Published or user-confirmed outreach destinations: ${channels.join(', ')}. Account availability must be checked on the platform.`
      : 'No direct outreach channel could be independently verified.',
  );
  observations.push('Google rating and review totals remain unknown and are not treated as claims.');

  const challenges = [];
  if (websiteStatus === 'none') challenges.push('No verified owned website is available.');
  if (websiteStatus === 'poor') challenges.push('The stored website is unavailable, weak, or not verified as owned.');
  if (socialStatus === 'missing') challenges.push('No verified social destination is available in the lead profile.');
  if (seoStatus === 'weak') challenges.push('The verified website has weak or unavailable basic search metadata.');
  if (verifiedWebsite && !hasClearCta) challenges.push('No clear website call to action was observed on the pages checked.');
  if (verifiedWebsite && !hasOnlineBooking) challenges.push('No online booking path was observed on the pages checked.');

  const offerings = profile.description
    ? `Public website description: ${profile.description}`
    : lead.industry
      ? `Reviewed lead profile category: ${lead.industry}.`
      : `Reviewed public lead profile for ${lead.company_name}.`;
  const evidenceNotes = observations.join(' ').slice(0, 1000);
  const sourceUrls = [...new Set([
    ...(Array.isArray(profile.sourceUrls) ? profile.sourceUrls : []),
    ...(hasWebsite ? [lead.website_url] : []),
  ].filter((url) => typeof url === 'string' && /^https?:\/\/\S+$/i.test(url)))].slice(0, 10);

  return {
    signals: {
      website_status: websiteStatus,
      social_status: socialStatus,
      seo_status: seoStatus,
      ...(verifiedWebsite ? { has_clear_cta: hasClearCta, has_online_booking: hasOnlineBooking } : {}),
      evidence_notes: evidenceNotes,
    },
    research: {
      source_type: 'manual_observation',
      offerings,
      ...(lead.industry || lead.location
        ? {
            target_audience: [
              lead.industry ? `Public business category: ${lead.industry}.` : '',
              lead.location ? `Public service location: ${lead.location}.` : '',
            ].filter(Boolean).join(' '),
          }
        : {}),
      observed_challenges: (challenges.join(' ') ||
        'No material public-profile gap was asserted.').slice(0, 1000),
      evidence_notes: evidenceNotes,
      source_urls: sourceUrls,
    },
    observations,
  };
}

async function latestReport(supabase, workspaceId, leadId) {
  const { data } = await supabase
    .from('lead_research_reports')
    .select('id, research_summary, source_urls, pain_points, confidence, created_at')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Collects public evidence, repairs missing contact destinations, runs the
 * existing qualification/research agents, and removes unknown-only claims.
 * The caller must use a signed-in Supabase client; the database remains the
 * authorization boundary for every write.
 */
export async function ensureAutomaticLeadIntelligence({
  supabase,
  workspaceId,
  lead,
  force = false,
}) {
  const currentReport = await latestReport(supabase, workspaceId, lead.id);
  const profile = await discoverLeadPublicContactProfile(supabase, lead);
  const contacts = await enrichLeadPublicContact(supabase, lead, profile);
  const currentSources = new Set(
    Array.isArray(currentReport?.source_urls) ? currentReport.source_urls : [],
  );
  const hasNewSource = (profile.sourceUrls ?? []).some(
    (source) => !currentSources.has(source),
  );
  if (!force && reportHasOpportunity(currentReport) && !hasNewSource) {
    return {
      report: currentReport,
      prepared: false,
      contacts,
      profile,
      observations: [],
    };
  }
  const evidence = buildAutomaticEvidence(lead, profile, contacts);

  const { data: qualification, error: qualificationError } = await supabase
    .rpc('run_lead_qualification', {
      check_workspace_id: workspaceId,
      check_lead_id: lead.id,
      input_signals: evidence.signals,
    })
    .single();
  if (qualificationError) {
    throw new Error(`Automatic qualification failed: ${qualificationError.message}`);
  }

  const { data: research, error: researchError } = await supabase
    .rpc('run_lead_research', {
      check_workspace_id: workspaceId,
      check_lead_id: lead.id,
      research_input: evidence.research,
    })
    .single();
  if (researchError) {
    throw new Error(`Automatic research failed: ${researchError.message}`);
  }

  const { data: finalized, error: finalizeError } = await supabase
    .rpc('finalize_automatic_lead_research', {
      check_workspace_id: workspaceId,
      check_lead_id: lead.id,
    })
    .single();
  if (finalizeError) {
    throw new Error(`Automatic research finalization failed: ${finalizeError.message}`);
  }

  return {
    prepared: true,
    contacts,
    profile,
    observations: evidence.observations,
    qualification,
    research,
    finalized,
    report: await latestReport(supabase, workspaceId, lead.id),
  };
}

export function opportunityFromAutomaticProfile(lead, profile) {
  if (!lead.website_url || !profile.officialWebsite) {
    return 'an evidence-led owned-website and customer journey review';
  }
  if (!profile.hasClearCta) return 'clarifying the website call to action';
  if (!profile.hasOnlineBooking) return 'simplifying online enquiry and booking';
  if (!(profile.linkedinUrl || profile.instagramHandle || profile.facebookUrl)) {
    return 'connecting the website with a consistent social proof system';
  }
  if (profile.seoStatus === 'weak') return 'strengthening local search visibility';
  return 'an evidence-led growth audit and channel strategy';
}
