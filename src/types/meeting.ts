export const MEETING_STATUSES = [
  'requested',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export type AvailabilityStatus = 'available' | 'busy' | 'tentative';

export interface Meeting {
  id: string;
  workspace_id: string;
  organizer_id: string | null;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  location: string | null;
  status: MeetingStatus;
  meet_link: string | null;
  client_id: string | null;
  lead_id: string | null;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MeetingParticipant {
  meeting_id: string;
  workspace_id: string;
  workspace_member_id: string;
  created_at: string;
}

export interface MeetingParticipantOption {
  id: string;
  label: string;
}

export interface AvailabilitySlot {
  id: string;
  workspace_id: string;
  workspace_member_id: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}
