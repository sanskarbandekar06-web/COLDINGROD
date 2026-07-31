export interface LeadResearchInput {
  offerings: string;
  targetAudience: string;
  differentiators: string;
  recentActivity: string;
  observedChallenges: string;
  evidenceNotes: string;
  sourceUrls: string[];
}

export interface LeadResearchSummary {
  offerings?: string;
  target_audience?: string;
  differentiators?: string;
  recent_activity?: string;
  observed_challenges?: string;
  evidence_notes?: string;
}

export interface LeadPainPoint {
  key: string;
  label: string;
  evidence: string;
  impact: string;
  service_opportunity: string;
  priority: 'high' | 'medium' | 'low';
  points: number;
}

export interface LeadResearchReport {
  id: string;
  workspace_id: string;
  lead_id: string;
  source_type: 'manual_observation' | 'provider_import';
  research_summary: LeadResearchSummary;
  source_urls: string[];
  pain_points: LeadPainPoint[];
  evidence_field_count: number;
  source_count: number;
  confidence: number;
  qualification_score_id: string;
  research_action_id: string;
  analysis_action_id: string;
  created_by: string;
  created_at: string;
}
