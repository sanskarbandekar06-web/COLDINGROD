export type LeadStatus = 'new' | 'analyzed' | 'contacted' | 'responded' | 'meeting_scheduled' | 'won' | 'lost';

export interface Lead {
  id: string;
  workspace_id: string;
  company_name: string;
  status: LeadStatus;
  source: string | null;
  website_url: string | null;
  industry: string | null;
  location: string | null;
  business_email: string | null;
  business_phone: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  is_primary: boolean;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  created_at: string;
}

export interface LeadScore {
  id: string;
  lead_id: string;
  score: number;
  algorithm_version: string | null;
  factors: LeadQualificationAnalysis | null;
  ai_action_id: string | null;
  scored_at: string;
}

export interface OutreachMessage {
  id: string;
  workspace_id: string;
  lead_id: string;
  contact_id: string | null;
  platform: 'instagram' | 'email' | 'linkedin' | 'whatsapp' | 'facebook' | 'sms';
  direction: 'inbound' | 'outbound';
  subject: string | null;
  content: string;
  status: 'draft' | 'pending_approval' | 'scheduled' | 'sent' | 'delivered' | 'failed' | 'replied';
  ai_action_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MessageVersion {
  id: string;
  outreach_message_id: string;
  content: string;
  edited_by: string | null;
  version_number: number;
  change_reason: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  workspace_id: string;
  entity_type: string; // 'lead', 'client', etc.
  entity_id: string;
  actor_type: 'human' | 'ai_agent' | 'system';
  actor_user_id: string | null;
  workspace_member_id: string | null;
  actor_agent_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
export interface LeadAssignedUser {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export interface LeadListItem extends Lead {
  assigned_user?: LeadAssignedUser;
  score?: { score: number };
}
export type WebsiteStatus = 'unknown' | 'none' | 'poor' | 'outdated' | 'good';
export type SocialStatus = 'unknown' | 'missing' | 'inactive' | 'active';
export type SeoStatus = 'unknown' | 'weak' | 'average' | 'strong';
export type QualificationBand =
  | 'high_priority'
  | 'qualified'
  | 'nurture'
  | 'low_opportunity';

export interface LeadQualificationSignals {
  websiteStatus: WebsiteStatus;
  socialStatus: SocialStatus;
  seoStatus: SeoStatus;
  googleRating: number | null;
  googleReviewCount: number | null;
  hasClearCta: boolean | null;
  hasOnlineBooking: boolean | null;
  evidenceNotes: string;
}

export interface LeadQualificationFactor {
  key: string;
  label: string;
  signal: string;
  points: number;
}

export interface LeadQualificationAnalysis {
  qualification_band: QualificationBand;
  confidence: number;
  factors: LeadQualificationFactor[];
  opportunities: string[];
}

export interface LeadQualificationSnapshot {
  id: string;
  lead_id: string;
  score: number;
  algorithm_version: string | null;
  factors: LeadQualificationAnalysis | null;
  ai_action_id: string | null;
  scored_at: string;
  action: {
    id: string;
    status: string;
    created_at: string;
    agent: { name: string } | null;
  } | null;
}
