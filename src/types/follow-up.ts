export type FollowUpSequenceStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type FollowUpStepStatus = 'planned' | 'draft_ready' | 'cancelled';

export interface FollowUpStep {
  id: string;
  workspace_id: string;
  sequence_id: string;
  step_number: number;
  due_at: string;
  status: FollowUpStepStatus;
  message_id: string | null;
  generation_action_id: string | null;
  compliance_action_id: string | null;
  prepared_at: string | null;
  created_at: string;
}

export interface FollowUpSequence {
  id: string;
  workspace_id: string;
  lead_id: string;
  contact_id: string;
  original_message_id: string;
  planning_action_id: string;
  status: FollowUpSequenceStatus;
  cadence_days: number[];
  stop_on_response: boolean;
  stopped_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  steps: FollowUpStep[];
}
