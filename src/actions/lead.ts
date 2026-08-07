'use server';

import { revalidatePath } from 'next/cache';
import { hasJoinedPermission } from '@/lib/permission-utils';
import { createClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types/lead';
import { isValidWorkspaceSlug } from '@/lib/workspace-slug';

const LEAD_STATUSES = new Set<LeadStatus>([
  'new',
  'analyzed',
  'contacted',
  'responded',
  'meeting_scheduled',
  'won',
  'lost',
]);

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function canManageLeads(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_permissions(permissions(key))')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  return !error && Boolean(data) && hasJoinedPermission(data.workspace_permissions, ['admin', 'manage_leads']);
}

async function isWorkspaceAssignee(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  return !error && Boolean(data);
}

export async function createLead(workspaceId: string, workspaceSlug: string, _prevState: unknown, formData: FormData) {
  if (!isValidWorkspaceSlug(workspaceSlug)) return { error: 'Invalid workspace.' };
  if (!(await canManageLeads(workspaceId))) {
    return { error: 'Permission denied. Must have manage_leads permission.' };
  }

  const companyName = optionalText(formData.get('companyName'), 200);
  const source = optionalText(formData.get('source'), 200);
  const firstName = optionalText(formData.get('firstName'), 100);
  const lastName = optionalText(formData.get('lastName'), 100);
  const email = optionalText(formData.get('email'), 320);
  const phone = optionalText(formData.get('phone'), 80);

  if (!companyName) return { error: 'Company name is required.' };
  if (!firstName && (lastName || email || phone)) {
    return { error: 'A contact first name is required when contact details are supplied.' };
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({ workspace_id: workspaceId, company_name: companyName, source, status: 'new' })
    .select('id')
    .single();

  if (leadError || !lead) {
    console.error('Error creating lead:', leadError);
    return { error: 'Failed to create lead.' };
  }

  if (firstName) {
    const { error: contactError } = await supabase.from('lead_contacts').insert({
      lead_id: lead.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      is_primary: true,
    });

    if (contactError) {
      await supabase.from('leads').delete().eq('id', lead.id).eq('workspace_id', workspaceId);
      console.error('Error creating lead contact:', contactError);
      return { error: 'The contact could not be saved, so the lead was not created.' };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: lead.id,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'lead_created',
      metadata: { source },
    });
  }

  const base = `/dashboard/${workspaceSlug}`;
  revalidatePath(base);
  revalidatePath(`${base}/leads`);
  revalidatePath(`${base}/activity`);
  return { success: true, leadId: lead.id };
}

export async function updateLead(workspaceId: string, leadId: string, _prevState: unknown, formData: FormData) {
  if (!(await canManageLeads(workspaceId))) return { error: 'Permission denied.' };

  const companyName = optionalText(formData.get('companyName'), 200);
  const source = optionalText(formData.get('source'), 200);
  const statusValue = String(formData.get('status') ?? '');
  const assignedValue = String(formData.get('assignedTo') ?? '');
  const assignedTo = assignedValue && assignedValue !== 'unassigned' ? assignedValue : null;

  if (!companyName) return { error: 'Company name is required.' };
  if (!LEAD_STATUSES.has(statusValue as LeadStatus)) return { error: 'Invalid lead status.' };
  if (assignedTo && !(await isWorkspaceAssignee(workspaceId, assignedTo))) {
    return { error: 'Assignee is not an active workspace member.' };
  }

  const supabase = await createClient();
  const { data: updatedLead, error } = await supabase
    .from('leads')
    .update({
      company_name: companyName,
      source,
      status: statusValue as LeadStatus,
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !updatedLead) {
    console.error('Error updating lead:', error);
    return { error: 'Lead not found or could not be updated.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'lead_updated',
      metadata: { fields_changed: ['company_name', 'source', 'status', 'assigned_to'] },
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/leads', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/leads/[leadId]', 'page');
  return { success: true };
}

export async function changeLeadStatus(workspaceId: string, leadId: string, status: LeadStatus) {
  if (!(await canManageLeads(workspaceId))) return { error: 'Permission denied.' };
  if (!LEAD_STATUSES.has(status)) return { error: 'Invalid lead status.' };

  const supabase = await createClient();
  const { data: updatedLead, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !updatedLead) return { error: 'Lead not found or status could not be updated.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'status_changed',
      metadata: { new_status: status },
    });
  }

  revalidatePath('/dashboard/[workspaceSlug]/leads', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/leads/[leadId]', 'page');
  return { success: true };
}

export async function deleteLead(workspaceId: string, leadId: string, workspaceSlug: string) {
  if (!(await canManageLeads(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Lead not found or could not be moved to trash.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'lead',
      entity_id: leadId,
      actor_type: 'human',
      actor_user_id: user.id,
      action: 'lead_archived',
      metadata: {},
    });
  }

  const base = isValidWorkspaceSlug(workspaceSlug)
    ? `/dashboard/${workspaceSlug}`
    : '/dashboard';
  revalidatePath(base);
  revalidatePath(`${base}/leads`);
  revalidatePath(`${base}/leads/trash`);
  revalidatePath(`${base}/activity`);
  return { success: true };
}

export async function restoreLead(workspaceId: string, leadId: string, workspaceSlug: string) {
  if (!(await canManageLeads(workspaceId))) return { error: 'Permission denied.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .select('id')
    .single();

  if (error || !data) return { error: 'Lead not found or could not be restored.' };

  const base = isValidWorkspaceSlug(workspaceSlug)
    ? `/dashboard/${workspaceSlug}`
    : '/dashboard';
  revalidatePath(base);
  revalidatePath(`${base}/leads`);
  revalidatePath(`${base}/leads/trash`);
  revalidatePath(`${base}/activity`);
  return { success: true };
}

export async function convertLeadToClient(workspaceId: string, leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('convert_lead_to_client', {
    p_workspace_id: workspaceId,
    p_lead_id: leadId,
  });

  if (error || typeof data !== 'string') {
    console.error('Error converting lead:', error);
    return { error: error?.message || 'Lead could not be converted.' };
  }

  revalidatePath('/dashboard/[workspaceSlug]/leads', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/leads/[leadId]', 'page');
  revalidatePath('/dashboard/[workspaceSlug]/clients', 'page');
  return { success: true, clientId: data };
}
