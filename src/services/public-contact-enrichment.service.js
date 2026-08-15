import 'server-only';

import { discoverPublicBusinessProfile } from '@/lib/public-business-profile';

const CONTACT_FIELDS =
  'id, first_name, last_name, email, phone, linkedin_url, instagram_handle, facebook_url';

async function readContacts(supabase, leadId) {
  const { data } = await supabase
    .from('lead_contacts')
    .select(CONTACT_FIELDS)
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false });

  return data ?? [];
}

/**
 * Best-effort repair for older leads created before discovery contact details
 * were carried into lead_contacts. RLS remains the final authorization layer.
 */
export async function enrichLeadPublicContact(supabase, lead, observedProfile = null) {
  const existing = await readContacts(supabase, lead.id);
  const profile = observedProfile ?? (lead.website_url
    ? await discoverPublicBusinessProfile(lead.website_url, lead.company_name)
    : {});
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

  if (profile.phone || profile.email) {
    await supabase
      .from('leads')
      .update({
        business_phone: profile.phone ?? lead.business_phone,
        business_email: profile.email ?? lead.business_email,
      })
      .eq('id', lead.id)
      .eq('workspace_id', lead.workspace_id)
      .is('deleted_at', null);
  }

  let contacts = await readContacts(supabase, lead.id);
  let contact = contacts[0];
  if (!contact) {
    const { data } = await supabase
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
    contact = data ?? null;
  } else {
    await supabase
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
  }

  contacts = await readContacts(supabase, lead.id);
  return contacts;
}
