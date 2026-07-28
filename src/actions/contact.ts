'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createContact(workspaceId: string, leadId: string, formData: FormData) {
  const supabase = await createClient();
  
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string || null;
  const email = formData.get('email') as string || null;
  const phone = formData.get('phone') as string || null;
  const jobTitle = formData.get('jobTitle') as string || null;
  const isPrimary = formData.get('isPrimary') === 'true';

  if (!firstName) {
    return { error: 'First name is required' };
  }

  const { error } = await supabase
    .from('lead_contacts')
    .insert({
      lead_id: leadId,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      job_title: jobTitle,
      is_primary: isPrimary
    });

  if (error) {
    console.error('Error creating contact:', error);
    return { error: 'Failed to create contact.' };
  }

  // Log activity
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'contact_added',
      metadata: { contact_name: `${firstName} ${lastName || ''}`.trim() }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true };
}

export async function deleteContact(workspaceId: string, leadId: string, contactId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('lead_contacts')
    .delete()
    .eq('id', contactId)
    .eq('lead_id', leadId);

  if (error) return { error: 'Failed to delete contact' };

  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true };
}
