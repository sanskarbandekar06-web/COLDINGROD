import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildLeadDossierDocx } from '../src/lib/lead-dossier-docx.js';

async function dossier(contact) {
  const buffer = await buildLeadDossierDocx({ workspaceName: 'Test workspace', preparedBy: 'Test reviewer', generatedAt: new Date('2026-09-14'), leads: [{
    company_name: 'Example Fitness', location: 'Mumbai', business_phone: '+912223456789',
    contacts: contact ? [contact] : [], report: null,
  }] });
  const zip = await JSZip.loadAsync(buffer);
  return { text: await zip.file('word/document.xml').async('string'), links: await zip.file('word/_rels/document.xml.rels').async('string') };
}

test('lead without published WhatsApp explicitly says Not available and does not guess a link', async () => {
  const output = await dossier({ first_name: 'Reception', phone: '+912223456789' });
  assert.ok(output.text.includes('WhatsApp direct links'));
  assert.match(output.text, /WhatsApp[\s\S]*Not available/);
  assert.ok(!output.links.includes('wa.me/'));
  assert.ok(output.links.includes('tel:+912223456789'));
});

test('published WhatsApp has a clickable direct link and a source', async () => {
  const output = await dossier({ first_name: 'Owner', whatsapp_number: '+919876543210', whatsapp_status: 'published', whatsapp_source_url: 'https://business.example/contact' });
  assert.ok(output.text.includes('Open WhatsApp chat +919876543210'));
  assert.ok(output.links.includes('https://wa.me/919876543210'));
  assert.ok(output.links.includes('https://business.example/contact'));
  assert.ok(!output.links.includes('wa.me/912223456789'));
});

test('user-marked unavailable WhatsApp is not exported as an actionable link', async () => {
  const output = await dossier({ first_name: 'Reception', whatsapp_number: '+919876543210', whatsapp_status: 'unavailable' });
  assert.ok(output.text.includes('Not available'));
  assert.ok(!output.links.includes('wa.me/'));
});
