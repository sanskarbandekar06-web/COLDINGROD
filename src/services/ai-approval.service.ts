import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { AiApproval, AiApprovalDecision } from '@/types/ai';
import { cache } from 'react';

export type ApprovalWithAction = AiApproval & {
  ai_action: {
    id: string;
    action_type: string;
    entity_type: string;
    entity_id: string | null;
    status: string;
    agent: { name: string } | null;
    // payload deliberately excluded from list projections
  } | null;
  approver: { full_name: string | null } | null;
};

export interface GetApprovalsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  decision?: AiApprovalDecision | 'all';
  sortBy?: 'decided_at';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedApprovals {
  data: ApprovalWithAction[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApprovalActionDetail {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  status: string;
  priority: string;
  payload: Record<string, unknown> | null;
  result_data: Record<string, unknown> | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  agent_id: string | null;
  created_by: string | null;
  agent: {
    id: string;
    name: string;
    description: string | null;
    model: string;
  } | null;
  creator: { id: string; full_name: string | null } | null;
}

export type ApprovalDecisionDetail = AiApproval & {
  approved_payload: Record<string, unknown> | null;
  approver: { id: string; full_name: string | null } | null;
};

export interface ApprovalDetails {
  action: ApprovalActionDetail;
  approval: ApprovalDecisionDetail | null;
  outreachMessage: {
    id: string;
    content: string;
    subject: string | null;
    platform: string;
    status: string;
    lead_id: string | null;
  } | null;
}

/**
 * Fetches decided AI approvals (approved or rejected history).
 *
 * Data model: ai_approvals only contains decided records.
 * Pending requests exist only as ai_actions with status='pending_approval'.
 * There is never a 'pending' row inside ai_approvals.
 *
 * Query strategy:
 *   PENDING  → SELECT from ai_actions WHERE status = 'pending_approval'
 *   APPROVED → SELECT from ai_approvals WHERE decision = 'approved'
 *   REJECTED → SELECT from ai_approvals WHERE decision = 'rejected'
 */
export const getAiApprovals = cache(async (params: GetApprovalsParams): Promise<PaginatedApprovals> => {
  const supabase = await createClient();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Note: payload deliberately excluded from this list query
  let query = supabase
    .from('ai_approvals')
    .select(
      `
      id, ai_action_id, workspace_id, approver_id, decision, reason, decided_at,
      ai_action:ai_actions!ai_approvals_ai_action_id_fkey(
        id, action_type, entity_type, entity_id, status,
        agent:ai_agents!ai_actions_agent_id_fkey(name)
      ),
      approver:users!ai_approvals_approver_id_fkey(full_name)
    `,
      { count: 'exact' }
    )
    .eq('workspace_id', params.workspaceId);

  // Only allow valid decision values — 'all' skips the filter
  if (params.decision && params.decision !== 'all') {
    query = query.eq('decision', params.decision);
  }

  const sortBy = params.sortBy || 'decided_at';
  const sortOrder = params.sortOrder || 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching approvals:', error.message);
    throw new Error('Failed to fetch approvals');
  }

  return {
    data: data as unknown as ApprovalWithAction[],
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

/**
 * Get pending approval actions.
 *
 * Fetches ai_actions with status=pending_approval — these do NOT yet have
 * a corresponding ai_approvals row. payload is excluded from this list query.
 */
export const getPendingApprovalActions = cache(async (workspaceId: string, page = 1, limit = 20) => {
  const supabase = await createClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // payload intentionally excluded from list projection
  const { data, count, error } = await supabase
    .from('ai_actions')
    .select(
      `
      id, action_type, entity_type, entity_id, status, priority, created_at, agent_id,
      agent:ai_agents!ai_actions_agent_id_fkey(name),
      creator:users!ai_actions_created_by_fkey(full_name)
    `,
      { count: 'exact' }
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending_approval')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching pending approvals:', error.message);
    throw new Error('Failed to fetch pending approvals');
  }

  return {
    data: data || [],
    count: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
});

/**
 * Fetch full details for the approval review page.
 *
 * Validates BOTH:
 *   1. ai_actions.workspace_id = workspaceId (prevents cross-workspace action access)
 *   2. ai_approvals.workspace_id = workspaceId (prevents cross-workspace approval access)
 *
 * outreach_message validated against workspace_id independently.
 */
export const getApprovalDetails = cache(async (
  workspaceId: string,
  actionId: string
): Promise<ApprovalDetails | null> => {
  const supabase = await createClient();

  // Fetch the action — workspace_id validated here
  const { data: action, error: actionError } = await supabase
    .from('ai_actions')
    .select(
      `
      id, action_type, entity_type, entity_id, status, priority, payload, result_data,
      retry_count, created_at, started_at, finished_at, agent_id, created_by,
      agent:ai_agents!ai_actions_agent_id_fkey(id, name, description, model),
      creator:users!ai_actions_created_by_fkey(id, full_name)
    `
    )
    .eq('id', actionId)
    .eq('workspace_id', workspaceId) // Workspace isolation
    .is('deleted_at', null)
    .single();

  if (actionError) {
    if (actionError.code === 'PGRST116') return null;
    console.error('Error fetching approval action:', actionError.message);
    throw new Error('Failed to fetch action');
  }

  // Fetch decision if one exists — also validated against workspace_id
  const { data: approval } = await supabase
    .from('ai_approvals')
    .select(`id, ai_action_id, workspace_id, approver_id, decision, reason, decided_at, approved_payload,
      approver:users!ai_approvals_approver_id_fkey(id, full_name)`)
    .eq('ai_action_id', actionId)
    .eq('workspace_id', workspaceId) // Workspace isolation validated on BOTH records
    .maybeSingle();

  const typedAction = action as unknown as ApprovalActionDetail;
  const typedApproval = approval as unknown as ApprovalDecisionDetail | null;
  // Fetch linked outreach message — entity_type allowlisted and workspace validated
  let outreachMessage: {
    id: string;
    content: string;
    subject: string | null;
    platform: string;
    status: string;
    lead_id: string | null;
  } | null = null;

  if (typedAction.entity_type === 'outreach_message' && typedAction.entity_id) {
    const { data: msg } = await supabase
      .from('outreach_messages')
      .select('id, content, subject, platform, status, lead_id')
      .eq('id', action.entity_id)
      .eq('workspace_id', workspaceId) // Outreach message also validated
      .maybeSingle();
    outreachMessage = msg as typeof outreachMessage;
  }

  return {
    action: typedAction,
    approval: typedApproval,
    outreachMessage,
  };
});
