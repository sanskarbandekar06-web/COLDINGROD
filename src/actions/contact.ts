'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type ContactActionResult = { success?: boolean; error?: string };

function formString(formData: FormData, key: string, maxLength: number): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function validOptionalUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function requireLeadInWorkspace(
  workspaceId: string,
  leadId: string,
): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in.');

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (leadError || !lead) throw new Error('Lead not found in this workspace.');

  return { supabase, userId: user.id };
}

export async function createContact(
  workspaceId: string,
  leadId: string,
  formData: FormData,
): Promise<ContactActionResult> {
  try {
    const firstName = formString(formData, 'firstName', 100);
    const lastName = formString(formData, 'lastName', 100);
    const email = formString(formData, 'email', 320)?.toLowerCase() ?? null;
    const phone = formString(formData, 'phone', 50);
    const jobTitle = formString(formData, 'jobTitle', 160);
    const linkedinUrl = formString(formData, 'linkedinUrl', 500);
    const instagramHandle =
      formString(formData, 'instagramHandle', 100)?.replace(/^@/, '') ?? null;
    const isPrimary = formData.get('isPrimary') === 'true';

    if (!firstName) throw new Error('First name is required.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address.');
    }
    if (!validOptionalUrl(linkedinUrl)) {
      throw new Error('Enter a valid LinkedIn URL.');
    }

    const { supabase, userId } = await requireLeadInWorkspace(workspaceId, leadId);
    const { data: contact, error: contactError } = await supabase
      .from('lead_contacts')
      .insert({
        lead_id: leadId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        job_title: jobTitle,
        linkedin_url: linkedinUrl,
        instagram_handle: instagramHandle,
        is_primary: isPrimary,
      })
      .select('id')
      .single();
    if (contactError || !contact) {
      throw new Error(contactError?.message || 'Failed to create contact.');
    }

    if (isPrimary) {
      const { error: primaryError } = await supabase
        .from('lead_contacts')
        .update({ is_primary: false })
        .eq('lead_id', leadId)
        .neq('id', contact.id);
      if (primaryError) throw new Error('Contact was added, but primary status could not be updated.');
    }

    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'contact_added',
      metadata: {
        contact_id: contact.id,
        contact_name: `${firstName} ${lastName || ''}`.trim(),
      },
    });
    if (activityError) {
      throw new Error('Contact was added, but activity logging failed.');
    }

    revalidatePath('/dashboard/[workspaceSlug]/leads/[leadId]', 'page');
    return { success: true };
  } catch (error: unknown) {
    console.error('Create contact error:', error);
    return { error: errorMessage(error, 'Failed to create contact.') };
  }
}

export async function deleteContact(
  workspaceId: string,
  leadId: string,
  contactId: string,
): Promise<ContactActionResult> {
  try {
    const { supabase, userId } = await requireLeadInWorkspace(workspaceId, leadId);
    const { data: contact, error: contactError } = await supabase
      .from('lead_contacts')
      .select('id, first_name, last_name')
      .eq('id', contactId)
      .eq('lead_id', leadId)
      .maybeSingle();
    if (contactError || !contact) throw new Error('Contact not found.');

    const { error: deleteError } = await supabase
      .from('lead_contacts')
      .delete()
      .eq('id', contactId)
      .eq('lead_id', leadId);
    if (deleteError) throw new Error(deleteError.message || 'Failed to delete contact.');

    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: userId,
      action: 'contact_removed',
      metadata: {
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name || ''}`.trim(),
      },
    });
    if (activityError) console.error('Failed to log contact removal:', activityError);

    revalidatePath('/dashboard/[workspaceSlug]/leads/[leadId]', 'page');
    return { success: true };
  } catch (error: unknown) {
    console.error('Delete contact error:', error);
    return { error: errorMessage(error, 'Failed to delete contact.') };
  }
}
