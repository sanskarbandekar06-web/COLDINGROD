import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  IntegrationCatalogItem,
  IntegrationProvider,
  IntegrationRecord,
} from '@/types/integration';

const PROVIDERS: Array<
  Pick<
    IntegrationCatalogItem,
    'provider' | 'name' | 'description' | 'capability' | 'implementation'
  >
> = [
  {
    provider: 'google',
    name: 'Google Places',
    description:
      'Search local businesses without exposing the provider key to the browser.',
    capability: 'Lead discovery',
    implementation: 'available',
  },
  {
    provider: 'hubspot',
    name: 'HubSpot',
    description: 'CRM synchronization adapter boundary.',
    capability: 'CRM',
    implementation: 'framework_ready',
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Workspace notification adapter boundary.',
    capability: 'Notifications',
    implementation: 'framework_ready',
  },
  {
    provider: 'zoom',
    name: 'Zoom',
    description: 'Meeting provider adapter boundary.',
    capability: 'Meetings',
    implementation: 'framework_ready',
  },
  {
    provider: 'stripe',
    name: 'Stripe',
    description: 'Payment status adapter boundary.',
    capability: 'Payments',
    implementation: 'framework_ready',
  },
  {
    provider: 'quickbooks',
    name: 'QuickBooks',
    description: 'Accounting synchronization adapter boundary.',
    capability: 'Accounting',
    implementation: 'framework_ready',
  },
  {
    provider: 'mailchimp',
    name: 'Mailchimp',
    description: 'Audience and campaign adapter boundary.',
    capability: 'Marketing',
    implementation: 'framework_ready',
  },
];

export function isGooglePlacesEnvironmentConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

export const getIntegrationCatalog = cache(
  async (workspaceId: string): Promise<IntegrationCatalogItem[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching integrations:', error.message);
      throw new Error('Failed to fetch workspace integrations');
    }

    const records = new Map(
      ((data ?? []) as IntegrationRecord[]).map((record) => [
        record.provider,
        record,
      ]),
    );
    const googleConfigured = isGooglePlacesEnvironmentConfigured();

    return PROVIDERS.map((provider) => {
      const record = records.get(provider.provider) ?? null;
      const enabled =
        record?.status === 'enabled' || record?.status === 'connected';
      const environmentConfigured =
        provider.provider === 'google' ? googleConfigured : false;
      return {
        ...provider,
        enabled,
        environmentConfigured,
        operational:
          provider.implementation === 'available' &&
          enabled &&
          environmentConfigured,
        record,
      };
    });
  },
);

export async function getEnabledIntegration(
  workspaceId: string,
  provider: IntegrationProvider,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .in('status', ['enabled', 'connected'])
    .maybeSingle();

  if (error) {
    console.error('Error checking integration:', error.message);
    return null;
  }
  return data as IntegrationRecord | null;
}
