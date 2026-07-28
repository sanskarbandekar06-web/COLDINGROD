export type AiActionStatus = 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
export type AiActionPriority = 'low' | 'normal' | 'high' | 'critical';
export type AiApprovalDecision = 'approved' | 'rejected';

export interface AiAgent {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  system_prompt: string | null;
  model: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AiAction {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string | null;
  action_type: string;
  status: AiActionStatus;
  priority: AiActionPriority;
  started_at: string | null;
  finished_at: string | null;
  retry_count: number;
  payload: Record<string, unknown>;
  result_data: Record<string, unknown> | null;
  agent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AiApproval {
  id: string;
  ai_action_id: string;
  workspace_id: string;
  approver_id: string;
  decision: AiApprovalDecision;
  reason: string | null;
  approved_payload: Record<string, unknown> | null;
  decided_at: string;
}
