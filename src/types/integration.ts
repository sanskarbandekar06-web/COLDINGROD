export type IntegrationProvider =
  | 'google'
  | 'stripe'
  | 'quickbooks'
  | 'hubspot'
  | 'slack'
  | 'mailchimp'
  | 'zoom';

export interface IntegrationRecord {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  status: string;
  metadata: Record<string, unknown> | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationCatalogItem {
  provider: IntegrationProvider;
  name: string;
  description: string;
  capability: string;
  implementation: 'available' | 'framework_ready';
  enabled: boolean;
  environmentConfigured: boolean;
  operational: boolean;
  accountConnected: boolean;
  record: IntegrationRecord | null;
}

export interface GooglePlacesSearchResult {
  placeId: string;
  name: string;
  address: string;
  googleMapsUri: string;
  websiteUri: string | null;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
}
