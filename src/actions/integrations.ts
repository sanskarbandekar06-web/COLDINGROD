'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import { getEnabledIntegration } from '@/services/integration.service';
import type { GooglePlacesSearchResult } from '@/types/integration';
import { discoverPublicBusinessProfile } from '@/lib/public-business-profile';

type IntegrationResult =
  | { success: true }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'EXECUTION_FAILED';
      error: string;
    };

export type GooglePlacesSearchActionResult =
  | {
      success: true;
      results: GooglePlacesSearchResult[];
      attribution: 'Google Maps';
    }
  | {
      success: false;
      code:
        | 'INVALID_INPUT'
        | 'UNAUTHORIZED'
        | 'NOT_ENABLED'
        | 'CONFIG_REQUIRED'
        | 'PROVIDER_ERROR';
      error: string;
    };

function validSlug(value: string) {
  const slug = value.trim();
  return slug.length > 0 && slug.length <= 120;
}

export async function setGooglePlacesEnabledAction(
  workspaceSlug: string,
  enabled: boolean,
): Promise<IntegrationResult> {
  if (
    typeof workspaceSlug !== 'string' ||
    typeof enabled !== 'boolean' ||
    !validSlug(workspaceSlug)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The integration request is invalid.',
    };
  }

  const slug = workspaceSlug.trim();
  const context = await getWorkspaceContext(slug);
  if (
    !context ||
    !context.permissions.includes('manage_integrations')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Integration management permission is required.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    'set_user_integration_enabled',
    {
      check_workspace_id: context.workspace.id,
      check_provider: 'google',
      check_enabled: enabled,
    },
  );

  if (error) {
    console.error('Google Places state update failed:', error.message);
    return {
      success: false,
      code: error.code === '42501' ? 'UNAUTHORIZED' : 'EXECUTION_FAILED',
      error:
        error.code === '42501'
          ? 'You no longer have permission to manage integrations.'
          : 'The integration state could not be updated.',
    };
  }

  const base = `/dashboard/${slug}`;
  revalidatePath(`${base}/integrations`);
  revalidatePath(`${base}/leads/discovery`);
  revalidatePath(`${base}/activity`);
  return { success: true };
}

function recordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeGoogleResult(value: unknown): GooglePlacesSearchResult | null {
  if (!recordValue(value) || typeof value.id !== 'string') return null;
  const displayName = recordValue(value.displayName)
    ? value.displayName.text
    : null;
  if (
    typeof displayName !== 'string' ||
    typeof value.formattedAddress !== 'string' ||
    typeof value.googleMapsUri !== 'string' ||
    !(
      /^https:\/\/(?:www\.)?google\.[^/]+\/maps(?:\/|\?|$)/i.test(
        value.googleMapsUri,
      ) ||
      /^https:\/\/maps\.google\.[^/]+(?:\/|\?|$)/i.test(
        value.googleMapsUri,
      )
    ) ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(value.id)
  ) {
    return null;
  }
  return {
    placeId: value.id,
    name: displayName.slice(0, 160),
    address: value.formattedAddress.slice(0, 240),
    googleMapsUri: value.googleMapsUri,
    websiteUri:
      typeof value.websiteUri === 'string' &&
      /^https?:\/\/\S+$/i.test(value.websiteUri)
        ? value.websiteUri.slice(0, 500)
        : null,
    phone: null,
    email: null,
    linkedinUrl: null,
    instagramHandle: null,
    facebookUrl: null,
    publicProfileSummary: null,
  };
}

async function recordHealth(
  workspaceId: string,
  succeeded: boolean,
  error: string | null,
) {
  const supabase = await createClient();
  const { error: healthError } = await supabase.rpc(
    'record_user_integration_health',
    {
      check_workspace_id: workspaceId,
      check_provider: 'google',
      check_succeeded: succeeded,
      check_error: error,
    },
  );
  if (healthError) {
    console.error('Integration health update failed:', healthError.message);
  }
}

export async function searchGooglePlacesAction(value: {
  workspaceSlug: string;
  query: string;
  pageSize: number;
}): Promise<GooglePlacesSearchActionResult> {
  if (
    !value ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.query !== 'string' ||
    typeof value.pageSize !== 'number' ||
    !validSlug(value.workspaceSlug) ||
    value.query.trim().length < 3 ||
    value.query.trim().length > 200 ||
    !Number.isInteger(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 20
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Enter a specific 3–200 character search and choose 1–20 results.',
    };
  }

  const slug = value.workspaceSlug.trim();
  const context = await getWorkspaceContext(slug);
  if (
    !context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }
  const enabled = await getEnabledIntegration(context.user.id, 'google');
  if (!enabled) {
    return {
      success: false,
      code: 'NOT_ENABLED',
      error: 'Enable Google Places in Integrations before searching.',
    };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      code: 'CONFIG_REQUIRED',
      error:
        'The server still needs GOOGLE_PLACES_API_KEY before live search can run.',
    };
  }

  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.websiteUri',
        },
        body: JSON.stringify({
          textQuery: value.query.trim(),
          pageSize: value.pageSize,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!response.ok) {
      const providerPayload: unknown = await response.json().catch(() => null);
      const providerError =
        recordValue(providerPayload) && recordValue(providerPayload.error)
          ? providerPayload.error
          : null;
      const providerStatus =
        providerError && typeof providerError.status === 'string'
          ? providerError.status
          : '';
      const providerMessage =
        providerError && typeof providerError.message === 'string'
          ? providerError.message
          : '';
      const providerDetails =
        providerError && Array.isArray(providerError.details)
          ? providerError.details
          : [];
      const providerReason = providerDetails
        .filter(recordValue)
        .map((detail) =>
          typeof detail.reason === 'string' ? detail.reason : '',
        )
        .find(Boolean);

      let publicError =
        'Google Places rejected the request. Check API restrictions, quota, and billing.';
      if (
        providerReason === 'SERVICE_DISABLED' ||
        /has not been used|is disabled/i.test(providerMessage)
      ) {
        publicError =
          'Places API (New) is disabled for this Google Cloud project. Enable Places API (New), wait a few minutes, and search again.';
      } else if (
        providerReason === 'BILLING_DISABLED' ||
        /billing/i.test(providerMessage)
      ) {
        publicError =
          'Google Cloud billing is not active for Places API (New). Enable billing and search again.';
      } else if (
        /referrer|IP address|application restriction/i.test(providerMessage)
      ) {
        publicError =
          'The Google key restriction blocks server-side Places requests. Use an IP/server-compatible restriction and restrict the key to Places API (New).';
      } else if (
        providerStatus === 'PERMISSION_DENIED' &&
        /API key/i.test(providerMessage)
      ) {
        publicError =
          'The Google Places API key is invalid or does not have Places API (New) permission.';
      }

      await recordHealth(
        context.workspace.id,
        false,
        `Google Places HTTP ${response.status}: ${providerReason || providerStatus || 'provider_error'}`,
      );
      return {
        success: false,
        code: 'PROVIDER_ERROR',
        error: publicError,
      };
    }

    const payload: unknown = await response.json();
    const places =
      recordValue(payload) && Array.isArray(payload.places)
        ? payload.places
        : [];
    const baseResults = places
      .map(safeGoogleResult)
      .filter((result): result is GooglePlacesSearchResult => result !== null);
    const results = await Promise.all(
      baseResults.map(async (result) => {
        if (!result.websiteUri) return result;
        const profile = await discoverPublicBusinessProfile(
          result.websiteUri,
          result.name,
        );
        const availablePlatforms = [
          profile.email && 'Email',
          profile.phone && 'WhatsApp/SMS',
          profile.linkedinUrl && 'LinkedIn',
          profile.instagramHandle && 'Instagram',
          profile.facebookUrl && 'Facebook',
        ].filter(Boolean);
        return {
          ...result,
          phone: result.phone ?? profile.phone ?? null,
          email: profile.email ?? null,
          linkedinUrl: profile.linkedinUrl ?? null,
          instagramHandle: profile.instagramHandle ?? null,
          facebookUrl: profile.facebookUrl ?? null,
          publicProfileSummary: [
            profile.officialWebsite
              ? `Verified public website${profile.pageTitle ? `: ${profile.pageTitle}` : ''}.`
              : 'The supplied website was not verified as an owned business site.',
            profile.description ? `Profile: ${profile.description}` : null,
            availablePlatforms.length
              ? `Available platforms: ${availablePlatforms.join(', ')}.`
              : 'No verified direct contact platform was found on the public site.',
          ].filter(Boolean).join(' ').slice(0, 1000),
        };
      }),
    );
    await recordHealth(context.workspace.id, true, null);
    revalidatePath(`/dashboard/${slug}/integrations`);
    return { success: true, results, attribution: 'Google Maps' };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Google Places timed out.'
        : 'Google Places could not be reached.';
    await recordHealth(context.workspace.id, false, message);
    return { success: false, code: 'PROVIDER_ERROR', error: message };
  }
}
