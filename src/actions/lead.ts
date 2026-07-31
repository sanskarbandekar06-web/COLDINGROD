'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { LeadStatus } from '@/types/lead';

export async function createLead(workspaceId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  
  const companyName = formData.get('companyName') as string;
  const source = formData.get('source') as string || null;
  
  if (!companyName) {
    return { error: 'Company name is required' };
  }

  // Insert Lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      workspace_id: workspaceId,
      company_name: companyName,
      source: source,
      status: 'new'
    })
    .select()
    .single();

  if (leadError) {
    console.error('Error creating lead:', leadError);
    return { error: 'Failed to create lead.' };
  }

  // Insert Contact if provided
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string || null;
  const email = formData.get('email') as string || null;
  const phone = formData.get('phone') as string || null;
  
  if (firstName) {
    await supabase.from('lead_contacts').insert({
      lead_id: lead.id,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      is_primary: true
    });
  }

  // Log Activity
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: lead.id,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'lead_created',
      metadata: { source }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  return { success: true, leadId: lead.id };
}

export async function updateLead(workspaceId: string, leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  
  const companyName = formData.get('companyName') as string;
  const source = formData.get('source') as string || null;
  const status = formData.get('status') as LeadStatus;
  const assignedTo = formData.get('assignedTo') as string || null;

  if (!companyName) {
    return { error: 'Company name is required' };
  }

  const { error } = await supabase
    .from('leads')
    .update({
      company_name: companyName,
      source,
      status,
      assigned_to: assignedTo,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('Error updating lead:', error);
    return { error: 'Failed to update lead.' };
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
      action: 'lead_updated',
      metadata: { fields_changed: ['company_name', 'source', 'status', 'assigned_to'] }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true };
}

export async function changeLeadStatus(workspaceId: string, leadId: string, status: LeadStatus) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to update status' };

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'status_changed',
      metadata: { new_status: status }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true };
}

export async function assignLead(workspaceId: string, leadId: string, userId: string | null) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('leads')
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to assign lead' };

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'lead_assigned',
      metadata: { assigned_to: userId }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true };
}

export async function deleteLead(workspaceId: string, leadId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('leads')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to delete lead' };

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  return { success: true };
}

export async function restoreLead(workspaceId: string, leadId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('leads')
    .update({ 
      deleted_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId);

  if (error) return { error: 'Failed to restore lead' };

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/leads/trash`, 'page');
  return { success: true };
}

export async function convertLeadToClient(workspaceId: string, leadId: string) {
  const supabase = await createClient();
  
  // 1. Get the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) return { error: 'Lead not found' };

  // 2. Create the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      workspace_id: workspaceId,
      name: lead.company_name,
      website: lead.source // assuming source might hold website, or leave null
    })
    .select()
    .single();

  if (clientError) return { error: 'Failed to create client' };

  // 3. Update the lead status
  await supabase
    .from('leads')
    .update({ status: 'won', updated_at: new Date().toISOString() })
    .eq('id', leadId);

  // 4. Log the conversion activity
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: authData.user.id,
      action: 'converted_to_client',
      metadata: { client_id: client.id }
    });
  }

  revalidatePath(`/dashboard/[workspaceSlug]/leads`, 'page');
  revalidatePath(`/dashboard/[workspaceSlug]/leads/[leadId]`, 'page');
  return { success: true, clientId: client.id };
}
