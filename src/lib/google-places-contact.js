import 'server-only';

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const PHONE_MAX_LENGTH = 80;

function normalizedPhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/\s+/g, ' ').trim().slice(0, PHONE_MAX_LENGTH);
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? phone : null;
}

export function phoneFromGooglePlace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return normalizedPhone(value.internationalPhoneNumber) ??
    normalizedPhone(value.nationalPhoneNumber);
}

/**
 * Looks up a stored Google Place ID only when a lead has no durable phone yet.
 * Failure is intentionally non-fatal: exports still contain all stored data.
 */
export async function getGooglePlacePhone(placeId, apiKey = process.env.GOOGLE_PLACES_API_KEY) {
  const normalizedPlaceId = String(placeId ?? '').trim();
  const normalizedApiKey = String(apiKey ?? '').trim();
  if (!PLACE_ID_PATTERN.test(normalizedPlaceId) || !normalizedApiKey) return null;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': normalizedApiKey,
          'X-Goog-FieldMask': 'internationalPhoneNumber,nationalPhoneNumber',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      console.error(`Google Place phone lookup failed with HTTP ${response.status}.`);
      return null;
    }
    return phoneFromGooglePlace(await response.json());
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown provider error';
    console.error(`Google Place phone lookup failed: ${reason}`);
    return null;
  }
}
