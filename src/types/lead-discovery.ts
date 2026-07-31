export type LeadDiscoverySource =
  | 'manual_intake'
  | 'csv_import'
  | 'google_places'
  | 'web_search';

export type LeadDiscoveryRunStatus =
  | 'running'
  | 'completed'
  | 'partially_imported'
  | 'imported'
  | 'failed'
  | 'cancelled';

export type LeadDiscoveryCandidateStatus =
  | 'ready'
  | 'duplicate'
  | 'imported'
  | 'dismissed';

export interface LeadDiscoveryBriefInput {
  runName: string;
  market: string;
  location: string;
  serviceFocus: string;
  notes: string;
}

export interface LeadDiscoveryCandidateInput {
  companyName: string;
  websiteUrl: string;
  industry: string;
  location: string;
  sourceUrl: string;
  businessEmail: string;
  businessPhone: string;
  evidenceNotes: string;
  externalReference: string;
}

export interface LeadDiscoveryRun {
  id: string;
  workspace_id: string;
  run_name: string;
  source_type: LeadDiscoverySource;
  market: string | null;
  target_location: string | null;
  service_focus: string | null;
  notes: string | null;
  status: LeadDiscoveryRunStatus;
  candidate_count: number;
  ready_count: number;
  duplicate_count: number;
  imported_count: number;
  ai_action_id: string | null;
  created_by: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DiscoveryLeadReference {
  id: string;
  company_name: string;
}

export interface LeadDiscoveryCandidate {
  id: string;
  run_id: string;
  workspace_id: string;
  source_index: number;
  company_name: string;
  normalized_name: string;
  fingerprint: string;
  website_url: string | null;
  industry: string | null;
  location: string | null;
  source_url: string | null;
  business_email: string | null;
  business_phone: string | null;
  evidence_notes: string | null;
  external_provider: 'google_places' | null;
  external_reference: string | null;
  status: LeadDiscoveryCandidateStatus;
  matched_lead_id: string | null;
  duplicate_of_candidate_id: string | null;
  imported_lead_id: string | null;
  created_at: string;
  updated_at: string;
  matched_lead: DiscoveryLeadReference | null;
  imported_lead: DiscoveryLeadReference | null;
}

export interface LeadDiscoveryRunDetail extends LeadDiscoveryRun {
  candidates: LeadDiscoveryCandidate[];
}
