import { load } from 'cheerio';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export function normalizePublicPhone(value, country) {
  if (typeof value !== 'string') return null;
  const raw = value.replace(/^tel:/i, '').split(/[;?]/)[0].trim();
  try {
    const phone = parsePhoneNumberFromString(raw, { defaultCountry: country, extract: false });
    if (!phone?.isValid()) return null;
    const type = phone.getType();
    return { number: phone.number, type: type === 'MOBILE' ? 'mobile' : type === 'FIXED_LINE' ? 'landline' : 'unknown' };
  } catch { return null; }
}

export function publicCountry(location, website) {
  const value = String(location ?? '');
  if (/\b(india|mumbai|pune|thane|navi mumbai|bengaluru|bangalore|delhi|hyderabad|chennai|kolkata|maharashtra)\b/i.test(value)) return 'IN';
  if (/\b(united kingdom|london|england)\b/i.test(value)) return 'GB';
  if (/\b(united states|usa)\b/i.test(value)) return 'US';
  try { if (new URL(website).hostname.endsWith('.in')) return 'IN'; } catch { /* no country evidence */ }
  return undefined;
}

function emailAddress(value) {
  const email = String(value ?? '').replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
  return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email) &&
    !/@(?:example\.(?:com|org)|domain\.com|email\.com)$/i.test(email) ? email : null;
}

export function publishedWhatsapp(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const raw = url.hostname === 'wa.me' ? url.pathname.slice(1) :
      ['api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname) ? url.searchParams.get('phone') : null;
    if (!raw || !/^\+?\d{8,15}$/.test(raw)) return null;
    return normalizePublicPhone(`+${raw.replace(/^\+/, '')}`)?.number ?? null;
  } catch { return null; }
}

const OWNER_ROLE = /\b(?:owner|co[- ]?owner|founder|co[- ]?founder|proprietor)\b/i;
const CONTACT_LABEL = /\b(?:tel(?:ephone)?|phone|mobile|call|contact|whatsapp)\b/i;

export function publicProfileLinks(html) {
  const $ = load(html);
  const links = $('a[href]').map((_, element) => $(element).attr('href')).get();
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const visit = (item) => {
        if (!item || typeof item !== 'object') return;
        if (![].concat(item['@type'] ?? []).includes('Person')) {
          links.push(...[].concat(item.sameAs ?? []).filter((value) => typeof value === 'string'));
        }
        for (const value of Object.values(item)) if (value && typeof value === 'object') visit(value);
      };
      visit(JSON.parse($(element).text()));
    } catch { /* Ignore malformed structured data. */ }
  });
  return [...new Set(links)];
}

/** Parse only a business-matched public page. Keep provenance per field. */
export function extractPublicContacts(html, pageUrl, country) {
  const $ = load(html);
  const evidence = [];
  const owners = [];
  let phone = null;
  let phoneType = 'unknown';
  let email = null;
  let whatsappNumber = null;
  let whatsappSourceUrl = null;
  const add = (field, value, excerpt, ownerName = null) => {
    if (!value || evidence.some((item) => item.field === field && item.value === value && item.owner_name === ownerName)) return;
    evidence.push({ field, value, source_url: pageUrl, excerpt: String(excerpt ?? '').replace(/\s+/g, ' ').slice(0,280), owner_name: ownerName });
  };
  const addPhone = (raw, excerpt) => {
    const parsed = normalizePublicPhone(raw, country);
    if (!parsed) return;
    if (!phone) { phone = parsed.number; phoneType = parsed.type; }
    add('phone', parsed.number, excerpt);
  };
  const addEmail = (raw, excerpt) => {
    const parsed = emailAddress(raw);
    if (!parsed) return;
    if (!email) email = parsed;
    add('email', parsed, excerpt);
  };
  const addOwner = (person) => {
    const name = String(person.name ?? '').trim();
    if (name.length < 3 || name.length > 140 || /^(?:our |the )?(?:owner|founder|team)$/i.test(name) || !OWNER_ROLE.test(person.role ?? '')) return;
    const parsed = normalizePublicPhone(person.phone, country);
    const ownerEmail = emailAddress(person.email);
    const wa = publishedWhatsapp(person.whatsapp);
    if (!parsed && !ownerEmail && !wa) return;
    if (owners.some((owner) => owner.name.toLowerCase() === name.toLowerCase())) return;
    const owner = { name, role: person.role, phone: parsed?.number ?? null, phoneType: parsed?.type ?? 'unknown',
      email: ownerEmail, whatsappNumber: wa, sourceUrl: pageUrl, excerpt: String(person.excerpt ?? '').slice(0,280) };
    owners.push(owner);
    add('owner_phone', owner.phone, owner.excerpt, name);
    add('owner_email', owner.email, owner.excerpt, name);
  };

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const ownerCard = anchor.closest('[itemtype*="Person"], .team-member, .founder, .owner');
    if (ownerCard.length) return;
    const href = anchor.attr('href') ?? '';
    if (/^tel:/i.test(href)) addPhone(href, anchor.text());
    if (/^mailto:/i.test(href)) addEmail(href, anchor.text());
    const wa = publishedWhatsapp(href);
    if (wa) {
      if (!whatsappNumber) { whatsappNumber = wa; whatsappSourceUrl = pageUrl; }
      add('whatsapp', wa, 'WhatsApp link published on the business website');
    }
  });

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const queue = [JSON.parse($(element).text())];
      while (queue.length) {
        const item = queue.shift();
        if (Array.isArray(item)) { queue.push(...item); continue; }
        if (!item || typeof item !== 'object') continue;
        const types = [].concat(item['@type'] ?? []);
        // Do not copy a named person's number into the generic business record.
        if (!types.includes('Person')) {
          if (item.telephone) addPhone(item.telephone, 'Published structured business telephone');
          if (item.email) addEmail(item.email, 'Published structured business email');
        }
        for (const person of [].concat(item.founder ?? item.founders ?? [])) {
          if (person && typeof person === 'object') addOwner({ name: person.name, role: 'Founder', phone: person.telephone, email: person.email, excerpt: `Founder ${person.name}` });
        }
        if (types.includes('Person') && OWNER_ROLE.test(item.jobTitle ?? '')) {
          addOwner({ name: item.name, role: item.jobTitle, phone: item.telephone, email: item.email, excerpt: `${item.name}, ${item.jobTitle}` });
        }
        for (const value of Object.values(item)) if (value && typeof value === 'object') queue.push(value);
      }
    } catch { /* malformed structured data does not verify any fact */ }
  });

  $('script, style, noscript, svg').remove();
  $('p, address, li, td').each((_, element) => {
    if ($(element).closest('[itemtype*="Person"], .team-member, .founder, .owner').length) return;
    const line = $(element).text().replace(/\s+/g, ' ').trim();
    if (line.length > 600) return;
    for (const candidate of line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) addEmail(candidate, line);
    if (!CONTACT_LABEL.test(line)) return;
    for (const raw of line.match(/\+?\d[\d ().-]{6,}\d/g) ?? []) {
      addPhone(raw, line);
      if (/\bwhatsapp\s*[:+\d]/i.test(line) && (line.match(/\+?\d[\d ().-]{6,}\d/g) ?? []).length === 1) {
        const parsed = normalizePublicPhone(raw, country);
        if (parsed) {
          if (!whatsappNumber) { whatsappNumber = parsed.number; whatsappSourceUrl = pageUrl; }
          add('whatsapp', parsed.number, line);
        }
      }
    }
  });
  $('[itemtype*="Person"], .team-member, .founder, .owner, article').each((_, element) => {
    const card = $(element);
    const excerpt = card.find('*').contents().filter((_, node) => node.type === 'text').map((_, node) => $(node).text()).get().join(' ').replace(/\s+/g, ' ').trim();
    if (excerpt.length > 1500 || !OWNER_ROLE.test(excerpt)) return;
    const name = card.find('[itemprop="name"], h2, h3, h4').first().text().trim();
    const role = card.find('[itemprop="jobTitle"], .role, .designation').first().text().trim() || excerpt.match(OWNER_ROLE)?.[0];
    addOwner({ name, role, phone: card.find('a[href^="tel:"]').first().attr('href'),
      email: card.find('a[href^="mailto:"]').first().attr('href'),
      whatsapp: card.find('a[href*="wa.me/"], a[href*="whatsapp.com/"]').first().attr('href'), excerpt });
  });
  return { phone, phoneType, email, whatsappNumber, whatsappSourceUrl, contactEvidence: evidence.slice(0,50), owners: owners.slice(0,5) };
}
