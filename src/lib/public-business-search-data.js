const GENERIC_WORDS = new Set([
  'and', 'best', 'business', 'club', 'company', 'fitness', 'gym', 'hotel',
  'in', 'india', 'limited', 'llp', 'ltd', 'near', 'of', 'private', 'restaurant',
  'services', 'studio', 'the', 'with',
]);
const LOCATION_WORDS_TO_IGNORE = new Set([
  'address', 'floor', 'india', 'maharashtra', 'near', 'opposite', 'plot',
  'road', 'sector', 'shop', 'street',
]);

function normalizedWords(value) {
  return String(value ?? '').toLowerCase().replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function usefulWords(value, ignored) {
  return [...new Set(normalizedWords(value).filter((word) =>
    word.length >= 3 && !/^\d+$/.test(word) && !ignored.has(word)))];
}

export function searchResultMatchesBusiness(result, lead) {
  const textWords = new Set(normalizedWords(`${result?.title ?? ''} ${result?.description ?? ''} ${result?.url ?? ''}`));
  const businessWords = usefulWords(lead?.company_name, GENERIC_WORDS);
  const fallbackBusinessWords = usefulWords(lead?.company_name, new Set());
  const identityWords = businessWords.length ? businessWords : fallbackBusinessWords;
  if (!identityWords.length) return false;
  const businessMatches = identityWords.filter((word) => textWords.has(word)).length;
  const requiredBusinessMatches = identityWords.length === 1 ? 1 : Math.min(2, identityWords.length);
  if (businessMatches < requiredBusinessMatches) return false;

  const locationWords = usefulWords(lead?.location, LOCATION_WORDS_TO_IGNORE).slice(0, 12);
  return locationWords.length === 0 || locationWords.some((word) => textWords.has(word));
}

export function socialProfileFromSearchResult(result, lead) {
  if (!searchResultMatchesBusiness(result, lead)) return {};
  try {
    const url = new URL(result.url);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    if (host === 'instagram.com' && segments[0] &&
      !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(segments[0].toLowerCase())) {
      return { instagramHandle: segments[0].replace(/^@/, '').slice(0, 30) };
    }
    if (host === 'linkedin.com' && ['company', 'in'].includes(segments[0]?.toLowerCase()) && segments[1]) {
      return { linkedinUrl: `https://www.linkedin.com/${segments[0].toLowerCase()}/${segments[1]}` };
    }
    if (['facebook.com', 'm.facebook.com'].includes(host) && segments[0] &&
      !['share', 'sharer', 'dialog', 'plugins', 'login'].includes(segments[0].toLowerCase())) {
      return { facebookUrl: `https://www.facebook.com/${segments.slice(0, 3).join('/')}` };
    }
  } catch { /* Invalid result URLs are not contact evidence. */ }
  return {};
}
