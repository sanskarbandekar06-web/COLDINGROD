/**
 * outreach.service.ts
 *
 * Service layer for outreach_messages.
 *
 * Active content strategy (centralized):
 *   The authoritative current content lives in outreach_messages.content.
 *   message_versions is an append-only audit trail; version_number is used
 *   for display ordering (DESC), with created_at DESC as tie-breaker.
 *
 * Workspace isolation: every query includes workspace_id and deleted_at IS NULL
 * at the message level. Leads and contacts are validated against the same workspace.
 */

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { OutreachMessage } from '@/types/lead';
import { cache } from 'react';
import { OutreachStatus, OutreachPlatform } from '@/types/outreach';

export interface OutreachMessageRow extends OutreachMessage {
  lead: { id: string; company_name: string } | null;
  contact: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    instagram_handle: string | null;
  } | null;
  ai_action: {
    id: string;
    action_type: string;
    status: string;
    agent: { name: string } | null;
  } | null;
}

export interface GetOutreachParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: OutreachStatus;
  platform?: OutreachPlatform;
  leadId?: string;
  aiGenerated?: boolean;
  archived?: boolean;
  sortBy?: 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedOutreach {
  data: OutreachMessageRow[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getOutreachMessages = cache(
  async (params: GetOutreachParams): Promise<PaginatedOutreach> => {
    const supabase = await createClient();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('outreach_messages')
      .select(
        `
        id, workspace_id, lead_id, contact_id, platform, direction,
        subject, status, ai_action_id, sent_at, created_at, updated_at, deleted_at,
        content,
        lead:leads!outreach_messages_lead_id_fkey(id, company_name),
        contact:lead_contacts!outreach_messages_contact_id_fkey(
          id, first_name, last_name, email, phone, linkedin_url, instagram_handle
        ),
        ai_action:ai_actions!outreach_messages_ai_action_id_fkey(
          id, action_type, status,
          agent:ai_agents!ai_actions_agent_id_fkey(name)
        )
      `,
        { count: 'exact' }
      )
      .eq('workspace_id', params.workspaceId);

    if (params.archived) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
    }

    if (params.search) {
      query = query.ilike('content', `%${params.search}%`);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.platform) {
      query = query.eq('platform', params.platform);
    }
    if (params.leadId) {
      query = query.eq('lead_id', params.leadId);
    }
    if (params.aiGenerated === true) {
      query = query.not('ai_action_id', 'is', null);
    } else if (params.aiGenerated === false) {
      query = query.is('ai_action_id', null);
    }

    const sortBy = params.sortBy || 'updated_at';
    const sortOrder = params.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error fetching outreach messages:', error.message);
      throw new Error('Failed to fetch outreach messages');
    }

    return {
      data: (data as unknown as OutreachMessageRow[]) || [],
      count: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0,
    };
  }
);


export interface OutreachMessageDetailLead {
  id: string;
  company_name: string;
  status: string;
  workspace_id: string;
}

export interface OutreachMessageDetail extends Omit<OutreachMessageRow, 'lead'> {
  lead: OutreachMessageDetailLead | null;
  lead_full: OutreachMessageDetailLead | null;
  ai_approval: {
    id: string;
    decision: string;
    reason: string | null;
    approved_payload: Record<string, unknown> | null;
    decided_at: string;
    approver: { full_name: string | null } | null;
  } | null;
}


export const getOutreachMessageDetail = cache(
  async (
    workspaceId: string,
    messageId: string
  ): Promise<OutreachMessageDetail | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('outreach_messages')
      .select(
        `
        *,
        lead:leads!outreach_messages_lead_id_fkey(id, company_name, status, workspace_id),
        contact:lead_contacts!outreach_messages_contact_id_fkey(
          id, first_name, last_name, email, phone, linkedin_url, instagram_handle,
          job_title, is_primary
        ),
        ai_action:ai_actions!outreach_messages_ai_action_id_fkey(
          id, action_type, status, priority, created_at,
          agent:ai_agents!ai_actions_agent_id_fkey(id, name, description)
        )
      `
      )
      .eq('id', messageId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching outreach detail:', error.message);
      throw new Error('Failed to fetch outreach message');
    }

    if (!data) return null;

    // Fetch approval if there is a linked ai_action
    let aiApproval = null;
    const aiActionData = data.ai_action as { id?: string } | null;
    if (aiActionData?.id) {
      const { data: approval } = await supabase
        .from('ai_approvals')
        .select(
          `id, decision, reason, approved_payload, decided_at,
           approver:users!ai_approvals_approver_id_fkey(full_name)`
        )
        .eq('ai_action_id', aiActionData.id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      aiApproval = approval;
    }

    return {
      ...(data as unknown as OutreachMessageRow),
      lead: data.lead as OutreachMessageDetail['lead'],
      ai_approval: aiApproval as OutreachMessageDetail['ai_approval'],
      lead_full: data.lead as OutreachMessageDetail['lead_full'],
    };
  }
);

export interface OutreachStats {
  total: number;
  drafts: number;
  pendingApproval: number;
  approved: number;
  rejected: number;
  sent: number;
  aiGenerated: number;
  recentlyUpdated: number;
}

export const getOutreachStats = cache(
  async (workspaceId: string): Promise<OutreachStats> => {
    const supabase = await createClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const { data, error } = await supabase
      .from('outreach_messages')
      .select('id, status, ai_action_id, updated_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);

    if (error) {
      console.error('Error fetching outreach stats:', error.message);
      return {
        total: 0,
        drafts: 0,
        pendingApproval: 0,
        approved: 0,
        rejected: 0,
        sent: 0,
        aiGenerated: 0,
        recentlyUpdated: 0,
      };
    }

    const rows = data || [];
    return {
      total: rows.length,
      drafts: rows.filter((r) => r.status === 'draft').length,
      pendingApproval: rows.filter((r) => r.status === 'pending_approval')
        .length,
      // 'approved' is an ai_action status, not an outreach status.
      // We derive it from ai_action_id presence + status aggregation done in detail view.
      // For overview, 'scheduled' is the closest DB state for approved-ready content.
      approved: rows.filter((r) => r.status === 'scheduled').length,
      rejected: rows.filter((r) => r.status === 'failed').length,
      sent: rows.filter(
        (r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'replied'
      ).length,
      aiGenerated: rows.filter((r) => r.ai_action_id !== null).length,
      recentlyUpdated: rows.filter(
        (r) => new Date(r.updated_at) > cutoff
      ).length,
    };
  }
);

/**
 * Validates that a lead exists and belongs to the given workspace (not soft-deleted).
 * Used server-side before creating or editing outreach messages.
 */
export async function validateLeadWorkspaceOwnership(
  workspaceId: string,
  leadId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Validates that a contact belongs to the given lead (and by extension, workspace).
 */
export async function validateContactLeadOwnership(
  leadId: string,
  contactId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('lead_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('lead_id', leadId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Fetches leads (id, company_name) for a workspace — used in create message form.
 * Lightweight projection only.
 */
export const getLeadsForOutreach = cache(
  async (workspaceId: string): Promise<{ id: string; company_name: string }[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('leads')
      .select('id, company_name')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('company_name', { ascending: true })
      .limit(200);
    return data || [];
  }
);

/**
 * Fetches contacts for a specific lead — used in create message form after lead selection.
 */
export const getContactsForLead = cache(
  async (leadId: string): Promise<{
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    instagram_handle: string | null;
  }[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('lead_contacts')
      .select(
        'id, first_name, last_name, email, phone, linkedin_url, instagram_handle'
      )
      .eq('lead_id', leadId)
      .order('is_primary', { ascending: false });
    return data || [];
  }
);
