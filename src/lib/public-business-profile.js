import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_HTML_BYTES = 600_000;
const MAX_SUPPORTING_PAGES = 2;
const SOCIAL_HOSTS = {
  linkedin: new Set(['linkedin.com', 'www.linkedin.com']),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
};
const GENERIC_NAME_WORDS = new Set([
  'and', 'the', 'company', 'services', 'solutions', 'restaurant',
  'restaurants', 'studio', 'studios', 'gym', 'gyms', 'fitness',
]);

/**
 * @typedef {Object} PublicBusinessProfile
 * @property {string=} phone
 * @property {string=} email
 * @property {string=} linkedinUrl
 * @property {string=} instagramHandle
 * @property {string=} facebookUrl
 * @property {boolean} websiteAnalyzed
 * @property {boolean} officialWebsite
 * @property {boolean} businessNameMatched
 * @property {boolean|null} hasClearCta
 * @property {boolean|null} hasOnlineBooking
 * @property {'unknown'|'weak'|'average'|'strong'} seoStatus
 * @property {string=} pageTitle
 * @property {string=} description
 * @property {string=} finalUrl
 * @property {string[]} sourceUrls
 * @property {string=} analysisError
 */

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb')
  );
}

async function verifiedPublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('UNSAFE_URL');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('UNSAFE_URL');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('UNSAFE_URL');
    return url;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('UNSAFE_URL');
  }
  return url;
}

function decodeHtml(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x2F;', '/')
    .replaceAll('&#47;', '/')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim();
}

function compactText(value, maximum = 600) {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function normalizedIdentity(value) {
  return compactText(value, 2_000)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @returns {Partial<PublicBusinessProfile>} */
function profileFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    if (SOCIAL_HOSTS.linkedin.has(host) && segments[0]?.toLowerCase() === 'company' && segments[1]) {
      return { linkedinUrl: `https://www.linkedin.com/company/${segments[1]}` };
    }
    if (SOCIAL_HOSTS.instagram.has(host) && segments[0] &&
      !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(segments[0].toLowerCase())) {
      return { instagramHandle: segments[0].replace(/^@/, '').slice(0, 100) };
    }
    if (SOCIAL_HOSTS.facebook.has(host) && segments[0] &&
      !['share', 'sharer', 'dialog', 'plugins', 'login'].includes(segments[0].toLowerCase())) {
      return { facebookUrl: `https://www.facebook.com/${segments[0]}` };
    }
  } catch {
    return {};
  }
  return {};
}

async function readLimitedHtml(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let html = '';
  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (received >= MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return html + decoder.decode();
}

async function fetchPublicHtml(value) {
  let current = await verifiedPublicUrl(value);
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ColdingrodPublicResearch/2.0',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('INVALID_REDIRECT');
      current = await verifiedPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
      throw new Error('NO_PUBLIC_HTML');
    }
    return { html: await readLimitedHtml(response), finalUrl: current };
  }
  throw new Error('TOO_MANY_REDIRECTS');
}

function contactHref(value) {
  const normalized = decodeHtml(value);
  if (normalized.toLowerCase().startsWith('tel:')) {
    return { phone: normalized.slice(4).split(/[?;]/, 1)[0].trim().slice(0, 80) };
  }
  if (normalized.toLowerCase().startsWith('mailto:')) {
    return { email: normalized.slice(7).split('?', 1)[0].trim().toLowerCase().slice(0, 320) };
  }
  return {};
}

function metaContent(html, key, attribute = 'name') {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const selector = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    if (selector?.toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return compactText(content);
  }
  return '';
}

function pageFacts(html) {
  const title = compactText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '', 300);
  const h1 = compactText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '', 300);
  const description = metaContent(html, 'description') || metaContent(html, 'og:description', 'property');
  const siteName = metaContent(html, 'og:site_name', 'property');
  const visibleText = compactText(html, 50_000).toLowerCase();
  const hasClearCta = /\b(contact us|get started|get a quote|request (?:a )?(?:quote|consultation)|call now|enquire now|inquire now|join now|talk to us|book (?:now|a call)|schedule (?:now|a call|an appointment))\b/i.test(visibleText);
  const hasOnlineBooking = /\b(book (?:now|online|an appointment|a class)|schedule (?:online|an appointment|a consultation)|reserve (?:now|a table)|online booking|make an appointment)\b/i.test(visibleText) ||
    /(?:calendly\.com|acuityscheduling\.com|booksy\.com|mindbodyonline\.com|wa\.me\/[^"'\s]+\?text=)/i.test(html);
  const seoSignals = [
    Boolean(title), Boolean(description), Boolean(h1),
    /<link\b[^>]*rel\s*=\s*["'][^"']*canonical/i.test(html),
    /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html),
  ].filter(Boolean).length;
  return {
    title, h1, description, siteName, hasClearCta, hasOnlineBooking,
    seoStatus: seoSignals >= 4 ? 'strong' : seoSignals >= 2 ? 'average' : 'weak',
  };
}

function mergePageDetails(target, html, finalUrl) {
  const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    const rawHref = decodeHtml(match[1]);
    const contact = contactHref(rawHref);
    if (!target.phone && contact.phone) target.phone = contact.phone;
    if (!target.email && contact.email) target.email = contact.email;
    try {
      const profile = profileFromUrl(new URL(rawHref, finalUrl).toString());
      if (!target.linkedinUrl && profile.linkedinUrl) target.linkedinUrl = profile.linkedinUrl;
      if (!target.instagramHandle && profile.instagramHandle) target.instagramHandle = profile.instagramHandle;
      if (!target.facebookUrl && profile.facebookUrl) target.facebookUrl = profile.facebookUrl;
    } catch {
      // Ignore malformed or non-HTTP links from the public page.
    }
  }

  const jsonLdPattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]));
      const queue = [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (Array.isArray(item)) {
          queue.push(...item);
          continue;
        }
        if (!item || typeof item !== 'object') continue;
        if (!target.phone && typeof item.telephone === 'string') target.phone = item.telephone.trim().slice(0, 80);
        if (!target.email && typeof item.email === 'string') target.email = item.email.replace(/^mailto:/i, '').trim().toLowerCase().slice(0, 320);
        for (const socialUrl of Array.isArray(item.sameAs) ? item.sameAs : []) {
          if (typeof socialUrl !== 'string') continue;
          const profile = profileFromUrl(socialUrl);
          if (!target.linkedinUrl && profile.linkedinUrl) target.linkedinUrl = profile.linkedinUrl;
          if (!target.instagramHandle && profile.instagramHandle) target.instagramHandle = profile.instagramHandle;
          if (!target.facebookUrl && profile.facebookUrl) target.facebookUrl = profile.facebookUrl;
        }
        for (const value of Object.values(item)) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
    } catch {
      // Invalid JSON-LD should not block the rest of the verified page.
    }
  }
}

function supportingPageUrls(html, finalUrl) {
  const urls = [];
  const base = new URL(finalUrl);
  const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null && urls.length < MAX_SUPPORTING_PAGES) {
    try {
      const candidate = new URL(decodeHtml(match[1]), base);
      if (candidate.origin !== base.origin) continue;
      if (!/\b(contact|about|connect|reach-us|get-in-touch)\b/i.test(candidate.pathname)) continue;
      candidate.hash = '';
      const normalized = candidate.toString();
      if (normalized !== base.toString() && !urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Ignore invalid links.
    }
  }
  return urls;
}

function businessIdentityMatched(expectedBusinessName, facts, finalUrl) {
  const expected = normalizedIdentity(expectedBusinessName);
  if (!expected) return true;
  const identity = normalizedIdentity(`${facts.title} ${facts.h1} ${facts.siteName}`);
  if (identity.includes(expected)) return true;
  const host = new URL(finalUrl).hostname.replace(/^www\./i, '').toLowerCase();
  const significantWords = expected.split(' ')
    .filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word));
  return significantWords.some((word) => host.includes(word));
}

/** @returns {Promise<PublicBusinessProfile>} */
export async function discoverPublicBusinessProfile(websiteUrl, expectedBusinessName = '') {
  /** @type {PublicBusinessProfile} */
  const discovered = {
    ...profileFromUrl(websiteUrl),
    websiteAnalyzed: false,
    officialWebsite: false,
    businessNameMatched: false,
    hasClearCta: null,
    hasOnlineBooking: null,
    seoStatus: 'unknown',
    sourceUrls: [],
  };
  if (discovered.linkedinUrl || discovered.instagramHandle || discovered.facebookUrl) {
    discovered.businessNameMatched = true;
    discovered.sourceUrls = [String(websiteUrl)];
    return discovered;
  }

  try {
    const { html, finalUrl } = await fetchPublicHtml(websiteUrl);
    const facts = pageFacts(html);
    discovered.websiteAnalyzed = true;
    discovered.finalUrl = finalUrl.toString();
    discovered.pageTitle = facts.title || undefined;
    discovered.description = facts.description || undefined;
    discovered.businessNameMatched = businessIdentityMatched(expectedBusinessName, facts, finalUrl);
    discovered.officialWebsite = discovered.businessNameMatched;
    discovered.sourceUrls.push(finalUrl.toString());
    if (!discovered.officialWebsite) return discovered;

    discovered.hasClearCta = facts.hasClearCta;
    discovered.hasOnlineBooking = facts.hasOnlineBooking;
    discovered.seoStatus = facts.seoStatus;
    mergePageDetails(discovered, html, finalUrl);
    const supportingPages = await Promise.allSettled(
      supportingPageUrls(html, finalUrl).map((url) => fetchPublicHtml(url)),
    );
    for (const page of supportingPages) {
      if (page.status !== 'fulfilled') continue;
      const supportingUrl = page.value.finalUrl.toString();
      if (!discovered.sourceUrls.includes(supportingUrl)) discovered.sourceUrls.push(supportingUrl);
      mergePageDetails(discovered, page.value.html, page.value.finalUrl);
      const supportingFacts = pageFacts(page.value.html);
      discovered.hasClearCta = Boolean(discovered.hasClearCta || supportingFacts.hasClearCta);
      discovered.hasOnlineBooking = Boolean(discovered.hasOnlineBooking || supportingFacts.hasOnlineBooking);
    }
  } catch (error) {
    discovered.analysisError = error instanceof Error ? error.message : 'PUBLIC_RESEARCH_FAILED';
  }
  return discovered;
}
