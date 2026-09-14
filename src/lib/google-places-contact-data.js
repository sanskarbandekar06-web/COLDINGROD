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

function publicHttpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function contactFromGooglePlace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { phone: null, websiteUrl: null, googleMapsUrl: null };
  }
  return {
    phone: phoneFromGooglePlace(value),
    websiteUrl: publicHttpUrl(value.websiteUri),
    googleMapsUrl: publicHttpUrl(value.googleMapsUri),
  };
}
