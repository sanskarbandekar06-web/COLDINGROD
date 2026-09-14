import 'server-only';
import { contactFromGooglePlace } from './google-places-contact-data.js';
export { contactFromGooglePlace, phoneFromGooglePlace } from './google-places-contact-data.js';

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;

/** Looks up public contact fields for a stored Google Place ID. Failure is non-fatal. */
export async function getGooglePlaceContact(placeId, apiKey = process.env.GOOGLE_PLACES_API_KEY) {
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
          'X-Goog-FieldMask': 'internationalPhoneNumber,nationalPhoneNumber,websiteUri,googleMapsUri',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      console.error(`Google Place phone lookup failed with HTTP ${response.status}.`);
      return null;
    }
    return contactFromGooglePlace(await response.json());
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown provider error';
    console.error(`Google Place phone lookup failed: ${reason}`);
    return null;
  }
}

export async function getGooglePlacePhone(placeId, apiKey = process.env.GOOGLE_PLACES_API_KEY) {
  return (await getGooglePlaceContact(placeId, apiKey))?.phone ?? null;
}
