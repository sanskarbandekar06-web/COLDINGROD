import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_HTML_BYTES = 600_000;
/** @typedef {{ phone?: string, email?: string, linkedinUrl?: string, instagramHandle?: string, facebookUrl?: string }} PublicBusinessProfile */
const SOCIAL_HOSTS = {
  linkedin: new Set(['linkedin.com', 'www.linkedin.com']),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
};

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
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

function decodeHref(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#x2F;', '/')
    .replaceAll('&#47;', '/')
    .trim();
}

/** @returns {PublicBusinessProfile} */
function profileFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);

    if (SOCIAL_HOSTS.linkedin.has(host) && segments[0]?.toLowerCase() === 'company' && segments[1]) {
      return { linkedinUrl: `https://www.linkedin.com/company/${segments[1]}` };
    }
    if (
      SOCIAL_HOSTS.instagram.has(host) &&
      segments[0] &&
      !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(segments[0].toLowerCase())
    ) {
      return { instagramHandle: segments[0].replace(/^@/, '').slice(0, 100) };
    }
    if (
      SOCIAL_HOSTS.facebook.has(host) &&
      segments[0] &&
      !['share', 'sharer', 'dialog', 'plugins', 'login'].includes(segments[0].toLowerCase())
    ) {
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

async function fetchPublicHomepage(value) {
  let current = await verifiedPublicUrl(value);
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ColdingrodPublicResearch/1.0',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
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
  const normalized = decodeHref(value);
  if (normalized.toLowerCase().startsWith('tel:')) {
    return { phone: normalized.slice(4).split(/[?;]/, 1)[0].trim().slice(0, 80) };
  }
  if (normalized.toLowerCase().startsWith('mailto:')) {
    return { email: normalized.slice(7).split('?', 1)[0].trim().toLowerCase().slice(0, 320) };
  }
  return {};
}

/** @returns {Promise<PublicBusinessProfile>} */
export async function discoverPublicBusinessProfile(websiteUrl, expectedBusinessName = '') {
  /** @type {PublicBusinessProfile} */
  const discovered = { ...profileFromUrl(websiteUrl) };
  if (discovered.linkedinUrl || discovered.instagramHandle || discovered.facebookUrl) {
    return discovered;
  }

  try {
    const { html, finalUrl } = await fetchPublicHomepage(websiteUrl);
    const normalizedName = String(expectedBusinessName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const normalizedHtml = html
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (normalizedName && !normalizedHtml.includes(normalizedName)) {
      return discovered;
    }
    const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = hrefPattern.exec(html)) !== null) {
      const rawHref = decodeHref(match[1]);
      const contact = contactHref(rawHref);
      if (!discovered.phone && contact.phone) discovered.phone = contact.phone;
      if (!discovered.email && contact.email) discovered.email = contact.email;
      try {
        const profile = profileFromUrl(new URL(rawHref, finalUrl).toString());
        if (!discovered.linkedinUrl && profile.linkedinUrl) discovered.linkedinUrl = profile.linkedinUrl;
        if (!discovered.instagramHandle && profile.instagramHandle) discovered.instagramHandle = profile.instagramHandle;
        if (!discovered.facebookUrl && profile.facebookUrl) discovered.facebookUrl = profile.facebookUrl;
      } catch {
        // Ignore malformed or non-HTTP links from the public page.
      }
    }
  } catch {
    // Enrichment is best-effort. The verified Places result remains usable.
  }
  return discovered;
}
