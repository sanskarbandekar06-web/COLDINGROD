import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPublicContacts, normalizePublicPhone, publishedWhatsapp, publicProfileLinks } from '../src/lib/public-contact-extractor.js';
import { readFile } from 'node:fs/promises';
import { supportsContactChannel, contactDestination } from '../src/lib/contact-channels.js';
import { mergeBasisIntoContext } from '../src/lib/browser-extension-context.js';
import { contactFromGooglePlace } from '../src/lib/google-places-contact-data.js';
import { searchResultMatchesBusiness, socialProfileFromSearchResult } from '../src/lib/public-business-search-data.js';

test('business landline never becomes a WhatsApp destination', () => {
  const profile = extractPublicContacts('<p>Telephone: +91 22 2345 6789</p>', 'https://business.example/contact', 'IN');
  assert.equal(profile.phone, '+912223456789');
  assert.equal(profile.phoneType, 'landline');
  assert.equal(profile.whatsappNumber, null);
  assert.equal(supportsContactChannel({ phone: profile.phone }, 'whatsapp'), false);
  assert.equal(contactDestination({ platform: 'whatsapp', content: 'Hello' }, { phone: profile.phone }), null);
});

test('social links include structured business profiles and decoded HTML links', () => {
  const links = publicProfileLinks('<a href="https://instagram.com/example?x=1&amp;y=2">IG</a><script type="application/ld+json">{"@type":"Organization","sameAs":["https://facebook.com/example"]}</script>');
  assert.ok(links.includes('https://instagram.com/example?x=1&y=2'));
  assert.ok(links.includes('https://facebook.com/example'));
});

test('owner cards do not silently become reception contacts', () => {
  const result = extractPublicContacts('<div class="founder"><h3>Asha Kumar</h3><p class="role">Founder</p><a href="tel:+919876543210">Call</a></div>', 'https://business.example/team', 'IN');
  assert.equal(result.phone, null);
  assert.equal(result.owners[0].phone, '+919876543210');
});

test('extension and app use identical destination validation', async () => {
  assert.equal(await readFile(new URL('../src/lib/contact-channels.js', import.meta.url), 'utf8'), await readFile(new URL('../browser-extension/contact-channels.js', import.meta.url), 'utf8'));
});

test('WhatsApp publication preserves its distinct number and source', () => {
  const profile = extractPublicContacts('<a href="tel:+912223456789">Telephone</a><a href="https://wa.me/919876543210">WhatsApp</a>', 'https://business.example/contact', 'IN');
  assert.equal(profile.phone, '+912223456789');
  assert.equal(profile.whatsappNumber, '+919876543210');
  assert.equal(profile.whatsappSourceUrl, 'https://business.example/contact');
  const contact = { whatsapp_number: profile.whatsappNumber, whatsapp_status: 'published' };
  assert.equal(contactDestination({ platform: 'whatsapp', content: 'Hi & hello' }, contact), 'https://wa.me/919876543210?text=Hi%20%26%20hello');
  assert.equal(publishedWhatsapp('https://wa.me.evil.test/919876543210'), null);
  assert.equal(publishedWhatsapp('https://wa.me/123456789'), null);
});

test('owner number requires a named owner source and does not inherit reception', () => {
  const profile = extractPublicContacts(`<a href="tel:+912223456789">Reception</a>
    <script type="application/ld+json">{"@type":"Organization","name":"Example","telephone":"+912223456789","founder":{"@type":"Person","name":"Asha Kumar","telephone":"+919876543210","email":"asha@business.example"}}</script>`, 'https://business.example/about', 'IN');
  assert.equal(profile.phone, '+912223456789');
  assert.equal(profile.owners[0].name, 'Asha Kumar');
  assert.equal(profile.owners[0].phone, '+919876543210');
  assert.equal(profile.owners[0].sourceUrl, 'https://business.example/about');
  const noDirectNumber = extractPublicContacts(`<a href="tel:+912223456789">Reception</a><script type="application/ld+json">{"@type":"Organization","founder":{"@type":"Person","name":"Asha Kumar"}}</script>`, 'https://business.example/about', 'IN');
  assert.deepEqual(noDirectNumber.owners, []);
});

test('unlabelled metrics and dates do not become phone numbers', () => {
  const profile = extractPublicContacts('<p>2018 - 2026</p><p>12345678900 views</p><p>Copyright 2026</p>', 'https://business.example', 'IN');
  assert.equal(profile.phone, null);
  assert.equal(normalizePublicPhone('9876543210'), null);
  assert.equal(normalizePublicPhone('9876543210', 'IN').number, '+919876543210');
});

test('extension contact enrichment cannot replace message identity or approval state', () => {
  const result = mergeBasisIntoContext({ selected_lead: { id: 'lead' }, messages: [
    { id: 'message-id', contact_id: 'contact-id', content: 'Approved copy', status: 'pending_approval', created_at: 'message-date' },
  ] }, { lead: { id: 'lead' }, contacts: [
    { id: 'contact-id', content: 'wrong', status: 'sent', created_at: 'contact-date', phone: '+912223456789', whatsapp_number: '+919876543210', whatsapp_status: 'published' },
  ] });
  assert.equal(result.messages[0].id, 'message-id');
  assert.equal(result.messages[0].content, 'Approved copy');
  assert.equal(result.messages[0].status, 'pending_approval');
  assert.equal(result.messages[0].created_at, 'message-date');
  assert.equal(result.messages[0].whatsapp_number, '+919876543210');
});

test('Google Place details preserve public phone, website, and evidence URL', () => {
  assert.deepEqual(contactFromGooglePlace({
    internationalPhoneNumber: '+91 98765 43210',
    nationalPhoneNumber: '098765 43210',
    websiteUri: 'https://business.example/contact',
    googleMapsUri: 'https://maps.google.com/?cid=123',
  }), {
    phone: '+91 98765 43210',
    websiteUrl: 'https://business.example/contact',
    googleMapsUrl: 'https://maps.google.com/?cid=123',
  });
});

test('public search accepts location-matched social profiles and rejects namesakes', () => {
  const lead = { company_name: 'Body Power Gym', location: 'Sector 9 Kamothe Navi Mumbai India' };
  const matching = { title: 'Body Power Gym Kamothe', description: 'Sector 9 Navi Mumbai', url: 'https://www.instagram.com/bodypowerkamothe/' };
  const namesake = { title: 'Body Power Gym', description: 'Jeddah Saudi Arabia', url: 'https://www.instagram.com/body_power_gym/' };
  assert.equal(searchResultMatchesBusiness(matching, lead), true);
  assert.deepEqual(socialProfileFromSearchResult(matching, lead), { instagramHandle: 'bodypowerkamothe' });
  assert.equal(searchResultMatchesBusiness(namesake, lead), false);
  assert.deepEqual(socialProfileFromSearchResult(namesake, lead), {});
});
