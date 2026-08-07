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

interface UserIntegrationRecord {
  user_id: string;
  provider: IntegrationProvider;
  status: string;
  connected_at: string | null;
  disconnected_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
}

export function isGooglePlacesEnvironmentConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

export const getIntegrationCatalog = cache(
  async (
    workspaceId: string,
    userId: string,
  ): Promise<IntegrationCatalogItem[]> => {
    const supabase = await createClient();
    const [workspaceResult, accountResult] = await Promise.all([
      supabase
        .from('integrations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('user_integrations')
        .select(
          'user_id, provider, status, connected_at, disconnected_at, last_checked_at, last_error',
        )
        .eq('user_id', userId),
    ]);

    if (workspaceResult.error) {
      console.error(
        'Error fetching integrations:',
        workspaceResult.error.message,
      );
      throw new Error('Failed to fetch workspace integrations');
    }
    if (accountResult.error) {
      console.error(
        'Error fetching account integrations:',
        accountResult.error.message,
      );
      throw new Error('Failed to fetch account integrations');
    }

    const records = new Map(
      ((workspaceResult.data ?? []) as IntegrationRecord[]).map((record) => [
        record.provider,
        record,
      ]),
    );
    const accountRecords = new Map(
      ((accountResult.data ?? []) as UserIntegrationRecord[]).map((record) => [
        record.provider,
        record,
      ]),
    );
    const googleConfigured = isGooglePlacesEnvironmentConfigured();

    return PROVIDERS.map((provider) => {
      const record = records.get(provider.provider) ?? null;
      const accountRecord = accountRecords.get(provider.provider) ?? null;
      const accountConnected =
        accountRecord?.status === 'enabled' ||
        accountRecord?.status === 'connected';
      const workspaceEnabled =
        record?.status === 'enabled' || record?.status === 'connected';
      const enabled =
        provider.provider === 'google'
          ? accountConnected
          : workspaceEnabled;
      const environmentConfigured =
        provider.provider === 'google' ? googleConfigured : false;
      return {
        ...provider,
        enabled,
        accountConnected,
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
  userId: string,
  provider: IntegrationProvider,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('user_id, provider, status, connected_at, last_checked_at, last_error')
    .eq('user_id', userId)
    .eq('provider', provider)
    .in('status', ['enabled', 'connected'])
    .maybeSingle();

  if (error) {
    console.error('Error checking account integration:', error.message);
    return null;
  }
  return data;
}
