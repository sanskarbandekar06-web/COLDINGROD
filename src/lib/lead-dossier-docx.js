import { whatsappDestination } from './contact-channels.js';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
} from 'docx';

const PAGE_WIDTH_DXA = 9360;
const TABLE_INDENT_DXA = 120;
const LABEL_WIDTH_DXA = 2700;
const VALUE_WIDTH_DXA = PAGE_WIDTH_DXA - LABEL_WIDTH_DXA;
const COLORS = {
  navy: '111827',
  indigo: '5548E8',
  indigoLight: 'EEECFF',
  blue: '2E74B5',
  darkBlue: '1F4D78',
  muted: '667085',
  border: 'D9DEE8',
  tableFill: 'E8EEF5',
  white: 'FFFFFF',
};

function text(value, fallback = 'Not available') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function instagramUrl(handle) {
  const normalized = String(handle ?? '').replace(/^@/, '').trim();
  return normalized
    ? `https://www.instagram.com/${encodeURIComponent(normalized)}/`
    : null;
}

function whatsappUrl(phone) {
  const normalized = phoneDigits(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}

function mapsUrl(lead) {
  const query = [lead.company_name, lead.location].filter(Boolean).join(', ');
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query || lead.company_name);
  if (lead.google_place_id) url.searchParams.set('query_place_id', lead.google_place_id);
  return url.toString();
}

function linkRun(label, url) {
  const link = safeUrl(url);
  if (!link) return new TextRun({ text: label, color: COLORS.muted });
  return new ExternalHyperlink({
    link,
    children: [
      new TextRun({
        text: label,
        color: COLORS.indigo,
        underline: { type: UnderlineType.SINGLE, color: COLORS.indigo },
      }),
    ],
  });
}

function definitionLine(label, value, url = null) {
  const rendered = text(value);
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: COLORS.navy }),
      url ? linkRun(rendered, url) : new TextRun({ text: rendered }),
    ],
    spacing: { after: 100, line: 300, lineRule: LineRuleType.AUTO },
  });
}

function heading(value, level, options = {}) {
  return new Paragraph({
    text: value,
    heading: level,
    pageBreakBefore: Boolean(options.pageBreakBefore),
    keepNext: true,
  });
}

function emptyNote(value) {
  return new Paragraph({
    children: [new TextRun({ text: value, italics: true, color: COLORS.muted })],
    spacing: { after: 120, line: 300, lineRule: LineRuleType.AUTO },
  });
}

function metadataCell(children, width, shading = null) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlignTable.CENTER,
    shading: shading
      ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' }
      : undefined,
    children,
  });
}

function metadataTable(rows) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };
  return new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    indent: { size: TABLE_INDENT_DXA, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH_DXA, VALUE_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        metadataCell([
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, color: COLORS.darkBlue })],
            spacing: { after: 0, line: 280, lineRule: LineRuleType.AUTO },
          }),
        ], LABEL_WIDTH_DXA, COLORS.tableFill),
        metadataCell([
          new Paragraph({
            children: [new TextRun({ text: text(value) })],
            spacing: { after: 0, line: 280, lineRule: LineRuleType.AUTO },
          }),
        ], VALUE_WIDTH_DXA),
      ],
    })),
  });
}

function sourceParagraph(label, url) {
  return new Paragraph({
    children: [linkRun(label, url)],
    numbering: { reference: 'source-links', level: 0 },
    spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO },
  });
}

function contactChildren(contact, index) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || `Contact ${index + 1}`;
  const children = [heading(name, HeadingLevel.HEADING_3)];
  if (contact.job_title) children.push(definitionLine('Role', contact.job_title));
  if (contact.is_primary) children.push(definitionLine('Contact type', 'Primary contact'));
  if (contact.email) children.push(definitionLine('Email', contact.email, `mailto:${contact.email}`));
  if (contact.phone) {
    children.push(definitionLine('Phone', contact.phone, `tel:${String(contact.phone).replace(/[^+\d]/g, '')}`));

  }
  if (whatsappDestination(contact)) {
    children.push(definitionLine('WhatsApp', contact.whatsapp_number, whatsappUrl(contact.whatsapp_number)));
    children.push(definitionLine('WhatsApp evidence', contact.whatsapp_status === 'confirmed' ? 'Confirmed by user' : 'Published by business'));
    if (contact.whatsapp_source_url) children.push(definitionLine('WhatsApp source', contact.whatsapp_source_url, contact.whatsapp_source_url));
  }
  if (contact.source_url) children.push(definitionLine('Contact source', contact.source_url, contact.source_url));
  if (contact.checked_at) children.push(definitionLine('Last checked', new Date(contact.checked_at).toLocaleDateString('en-GB')));
  if (contact.linkedin_url) children.push(definitionLine('LinkedIn', 'Open LinkedIn profile', contact.linkedin_url));
  if (contact.instagram_handle) children.push(definitionLine('Instagram', `@${String(contact.instagram_handle).replace(/^@/, '')}`, instagramUrl(contact.instagram_handle)));
  if (contact.facebook_url) children.push(definitionLine('Facebook', 'Open Facebook profile', contact.facebook_url));
  return children;
}

function discoveryContactChildren(contact, businessPhone) {
  if (!contact || typeof contact !== 'object') return [];
  const phone = contact.business_phone || businessPhone;
  const hasDiscoveryContact = Boolean(
    contact.business_email || phone || contact.linkedin_url ||
      contact.instagram_handle || contact.facebook_url,
  );
  if (!hasDiscoveryContact) return [];

  const children = [heading('Business channels', HeadingLevel.HEADING_3)];
  if (contact.business_email) {
    children.push(definitionLine('Email', contact.business_email, `mailto:${contact.business_email}`));
  }
  if (phone) {
    children.push(definitionLine('Phone', phone, `tel:${phoneDigits(phone)}`));

  }
  if (contact.linkedin_url) children.push(definitionLine('LinkedIn', 'Open LinkedIn profile', contact.linkedin_url));
  if (contact.instagram_handle) children.push(definitionLine('Instagram', `@${String(contact.instagram_handle).replace(/^@/, '')}`, instagramUrl(contact.instagram_handle)));
  if (contact.facebook_url) children.push(definitionLine('Facebook', 'Open Facebook profile', contact.facebook_url));
  return children;
}

function phoneNumberChildren(lead) {
  const entries = [];
  const seen = new Set();
  const addPhone = (label, value) => {
    const rendered = text(value, '');
    const key = phoneDigits(rendered);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({ label, value: rendered });
  };

  addPhone('Business phone', lead.business_phone);
  for (const [contactIndex, contact] of lead.contacts.entries()) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
      `Contact ${contactIndex + 1}`;
    addPhone(`${name} phone`, contact.phone);
  }
  addPhone('Discovery phone', lead.discovery_contact?.business_phone);

  if (!entries.length) {
    return [emptyNote('No verified phone number is available for this lead yet.')];
  }
  return entries.map((entry) => definitionLine(entry.label, entry.value, `tel:${entry.value.replace(/[^+\d]/g, '')}`));
}

function emailAddressChildren(lead) {
  const entries = [];
  const seen = new Set();
  const addEmail = (label, value) => {
    const rendered = text(value, '').toLowerCase();
    if (!rendered || seen.has(rendered)) return;
    seen.add(rendered);
    entries.push({ label, value: rendered });
  };

  addEmail('Business email', lead.business_email);
  for (const [contactIndex, contact] of lead.contacts.entries()) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
      `Contact ${contactIndex + 1}`;
    addEmail(`${name} email`, contact.email);
  }
  addEmail('Discovery email', lead.discovery_contact?.business_email);

  if (!entries.length) {
    return [emptyNote('No verified email address is available for this lead yet.')];
  }
  return entries.map((entry) =>
    definitionLine(entry.label, entry.value, `mailto:${entry.value}`),
  );
}

function leadChildren(lead, index, total) {
  const report = lead.report;
  const summary = report?.research_summary && typeof report.research_summary === 'object'
    ? report.research_summary
    : {};
  const painPoints = Array.isArray(report?.pain_points) ? report.pain_points : [];
  const sources = Array.isArray(report?.source_urls) ? report.source_urls.filter(safeUrl) : [];
  const children = [
    new Paragraph({
      children: [new TextRun({ text: `LEAD ${index + 1} OF ${total}`, bold: true, color: COLORS.indigo, size: 18 })],
      spacing: { before: index ? 0 : 180, after: 40 },
      pageBreakBefore: index > 0,
      keepNext: true,
    }),
    heading(text(lead.company_name, 'Unnamed lead'), HeadingLevel.HEADING_1),
    metadataTable([
      ['Pipeline status', text(lead.status).replaceAll('_', ' ')],
      ['Qualification score', lead.score == null ? 'Not available' : `${lead.score}/100`],
      ['Industry', lead.industry],
      ['Location', lead.location],
      ['Source', lead.source],
      ['Research confidence', report?.confidence == null ? 'Not available' : `${report.confidence}%`],
    ]),
    new Paragraph({ spacing: { after: 80 } }),
    heading('Verified destinations', HeadingLevel.HEADING_2),
  ];

  if (lead.website_url) children.push(definitionLine('Website', lead.website_url, lead.website_url));
  if (lead.business_email) children.push(definitionLine('Business email', lead.business_email, `mailto:${lead.business_email}`));
  if (lead.business_phone) {
    children.push(definitionLine('Business phone', lead.business_phone, `tel:${String(lead.business_phone).replace(/[^+\d]/g, '')}`));
  }
  children.push(definitionLine('Google Maps', lead.location || `Find ${lead.company_name} on Google Maps`, mapsUrl(lead)));
  if (lead.google_place_id) children.push(definitionLine('Google Place ID', lead.google_place_id));

  const owners = lead.contacts.filter((contact) => contact.contact_kind === 'owner');
  children.push(heading('Owner contacts', HeadingLevel.HEADING_2));
  if (owners.length) {
    for (const [ownerIndex, owner] of owners.entries()) children.push(...contactChildren(owner, ownerIndex));
  } else {
    children.push(emptyNote('No publicly listed owner contact was verified. Business reception numbers are not owner numbers.'));
  }
  children.push(heading('Phone numbers', HeadingLevel.HEADING_2));
  children.push(...phoneNumberChildren(lead));

  children.push(heading('Email addresses', HeadingLevel.HEADING_2));
  children.push(...emailAddressChildren(lead));

  children.push(emptyNote('Telephone links place calls. WhatsApp links appear only for a published or user-confirmed WhatsApp number; current account availability is confirmed when WhatsApp opens.'));
  children.push(heading('Contacts and social channels', HeadingLevel.HEADING_2));
  if (lead.contacts.length) {
    for (const [contactIndex, contact] of lead.contacts.entries()) {
      if (contact.contact_kind !== 'owner') children.push(...contactChildren(contact, contactIndex));
    }
  }
  const discoveryChildren = discoveryContactChildren(
    lead.discovery_contact,
    lead.contacts.some((contact) => contact.phone) ? null : lead.business_phone,
  );
  if (discoveryChildren.length) {
    children.push(...discoveryChildren);
  } else if (!lead.contacts.length) {
    children.push(emptyNote('No verified contact or social channel is stored for this lead yet.'));
  }

  children.push(heading('Executive Summary', HeadingLevel.HEADING_2));
  const summaryFields = [
    ['Offerings', summary.offerings],
    ['Target audience', summary.target_audience],
    ['Differentiators', summary.differentiators],
    ['Recent activity', summary.recent_activity],
    ['Observed challenges', summary.observed_challenges],
    ['Evidence notes', summary.evidence_notes],
  ];
  const availableSummary = summaryFields.filter(([, value]) => text(value, '') !== '');
  if (availableSummary.length) {
    for (const [label, value] of availableSummary) children.push(definitionLine(label, value));
  } else {
    children.push(emptyNote('The Executive Summary has not been generated for this lead yet.'));
  }

  children.push(heading('Detailed Analysis', HeadingLevel.HEADING_2));
  if (painPoints.length) {
    for (const [pointIndex, point] of painPoints.entries()) {
      children.push(heading(text(point.label, `Finding ${pointIndex + 1}`), HeadingLevel.HEADING_3));
      children.push(definitionLine('Priority', point.priority));
      children.push(definitionLine('Evidence', point.evidence));
      children.push(definitionLine('Business impact', point.impact));
      children.push(definitionLine('Service opportunity', point.service_opportunity));
    }
  } else {
    children.push(emptyNote('The Detailed Analysis has not been generated for this lead yet.'));
  }

  children.push(heading('Sources and evidence links', HeadingLevel.HEADING_2));
  const uniqueSources = [...new Set([
    lead.website_url,
    mapsUrl(lead),
    ...sources,
  ].map(safeUrl).filter(Boolean))];
  if (uniqueSources.length) {
    for (const [sourceIndex, source] of uniqueSources.entries()) {
      children.push(sourceParagraph(`Evidence ${sourceIndex + 1}: ${source}`, source));
    }
  } else {
    children.push(emptyNote('No public evidence links are stored for this lead yet.'));
  }

  return children;
}

export async function buildLeadDossierDocx({ workspaceName, preparedBy, generatedAt, leads }) {
  const generatedDate = new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(generatedAt);
  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'COLDINGROD', bold: true, color: COLORS.indigo, size: 18 }),
          new TextRun({ text: '  |  Confirmed Lead Dossier', color: COLORS.muted, size: 18 }),
        ],
        spacing: { after: 0 },
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${text(workspaceName)}  |  ${generatedDate}  |  Page `, color: COLORS.muted, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: COLORS.muted, size: 18 }),
        ],
      }),
    ],
  });

  const firstPage = [
    new Paragraph({
      children: [new TextRun({ text: 'SHAREABLE LEAD PACK', bold: true, color: COLORS.indigo, size: 19 })],
      spacing: { before: 160, after: 40 },
      keepNext: true,
    }),
    new Paragraph({
      style: 'DossierTitle',
      children: [new TextRun({ text: 'Confirmed Lead Dossier' })],
    }),
    new Paragraph({
      style: 'DossierSubtitle',
      children: [new TextRun({ text: `${text(workspaceName)} · ${leads.length} selected lead${leads.length === 1 ? '' : 's'}` })],
    }),
    metadataTable([
      ['Prepared for', text(workspaceName)],
      ['Prepared by', text(preparedBy, 'Coldingrod member')],
      ['Generated', generatedDate],
      ['Contents', 'Verified destinations, contacts, social channels, Executive Summary, Detailed Analysis, and source evidence'],
    ]),
  ];

  const content = [...firstPage];
  for (const [index, lead] of leads.entries()) {
    content.push(...leadChildren(lead, index, leads.length));
  }

  const document = new Document({
    creator: 'Coldingrod',
    title: `${workspaceName} Confirmed Lead Dossier`,
    subject: 'Selected lead contact, research, and evidence dossier',
    description: 'Generated by Coldingrod from verified workspace lead data.',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: COLORS.navy },
          paragraph: { spacing: { after: 120, line: 264, lineRule: LineRuleType.AUTO } },
        },
      },
      paragraphStyles: [
        {
          id: 'DossierTitle',
          name: 'Dossier Title',
          basedOn: 'Normal',
          next: 'DossierSubtitle',
          quickFormat: true,
          run: { font: 'Calibri', size: 56, bold: true, color: COLORS.navy },
          paragraph: { spacing: { before: 0, after: 100 }, keepNext: true },
        },
        {
          id: 'DossierSubtitle',
          name: 'Dossier Subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 27, color: COLORS.muted },
          paragraph: { spacing: { before: 0, after: 300 }, keepNext: true },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 32, bold: true, color: COLORS.blue },
          paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 26, bold: true, color: COLORS.blue },
          paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Calibri', size: 24, bold: true, color: COLORS.darkBlue },
          paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'source-links',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                  spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: content,
      },
    ],
  });

  return Packer.toBuffer(document);
}
