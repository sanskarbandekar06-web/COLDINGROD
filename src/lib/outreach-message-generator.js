import 'server-only';

const CHANNEL_LIMITS = {
  email: 1800,
  linkedin: 700,
  whatsapp: 500,
  instagram: 500,
  sms: 320,
};

const CHANNEL_STYLES = {
  email: 'a clear business email with a specific subject, short paragraphs, and a professional sign-off',
  linkedin: 'a professional, peer-to-peer LinkedIn message; concise, credible, and connection-oriented',
  whatsapp: 'a brief, conversational WhatsApp message that feels natural on mobile and avoids email-like formality',
  instagram: 'a friendly, lightweight Instagram DM with a casual but respectful voice',
  sms: 'an extremely concise SMS with one idea, one question, and STOP opt-out wording',
};

const OPT_OUTS = {
  email: 'If this is not relevant, just let me know and I will not follow up.',
  linkedin: 'If it is not relevant, no worries — I will not follow up.',
  whatsapp: 'If it is not relevant, just say so and I will not follow up.',
  instagram: 'No worries if it is not a fit — I will not follow up.',
  sms: 'Reply STOP to opt out.',
};

const GOAL_COPY = {
  book_call: {
    email: 'Would a short 15-minute conversation next week be useful?',
    linkedin: 'Open to a quick 15-minute chat next week?',
    whatsapp: 'Would a quick 15-minute chat next week be useful?',
    instagram: 'Open to a quick 15-minute chat next week?',
    sms: 'Open to a 15-min chat next week?',
  },
  offer_audit: {
    email: 'I can share a concise audit with a few practical next steps if that would help.',
    linkedin: 'Happy to share a short audit with a few practical next steps — useful?',
    whatsapp: 'I can send a short audit with a few practical next steps if useful.',
    instagram: 'Want me to send a quick audit with a few practical next steps?',
    sms: 'Want a short audit with practical next steps?',
  },
  share_idea: {
    email: 'Would it be helpful if I sent over one concrete idea?',
    linkedin: 'Would it help if I shared one concrete idea?',
    whatsapp: 'Want me to send one concrete idea?',
    instagram: 'Want me to send one practical idea?',
    sms: 'Want me to send one practical idea?',
  },
};

function clean(value, max = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanContent(value, max) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function limitFor(platform) {
  return CHANNEL_LIMITS[platform] ?? 700;
}

function optOutFor(platform) {
  return OPT_OUTS[platform] ?? OPT_OUTS.email;
}

function ensureOptOut(content, platform) {
  const normalized = content.toLowerCase();
  const hasOptOut = platform === 'sms'
    ? normalized.includes('stop')
    : normalized.includes('not relevant') ||
      normalized.includes('not a fit') ||
      normalized.includes('will not follow up');
  if (hasOptOut) return content;
  return `${content.trim()}\n\n${optOutFor(platform)}`;
}

function truncateWithOptOut(content, platform) {
  const optOut = optOutFor(platform);
  const max = limitFor(platform);
  const withOptOut = ensureOptOut(content, platform);
  if (withOptOut.length <= max) return withOptOut;
  const available = Math.max(40, max - optOut.length - 2);
  return `${withOptOut.slice(0, available).trim()}\n\n${optOut}`.slice(0, max);
}

function fallbackDraft({ platform, tone, goal, lead, contact, opportunity }) {
  const firstName = clean(contact.first_name, 80) || 'there';
  const company = clean(lead.company_name, 140);
  const idea = clean(opportunity, platform === 'sms' ? 90 : 220).toLowerCase();
  const cta = GOAL_COPY[goal]?.[platform] ?? GOAL_COPY.share_idea[platform];
  const warmStart = tone === 'warm';
  const concise = tone === 'concise';
  let subject = null;
  let content;

  switch (platform) {
    case 'linkedin':
      content = `Hi ${firstName} — ${warmStart ? `hope you are doing well. ` : ''}I noticed ${company} may have an opportunity around ${idea}. ${cta}\n\n${optOutFor(platform)}`;
      break;
    case 'whatsapp':
      content = `Hi ${firstName}${warmStart ? ' 👋' : ','} I was looking at ${company} and noticed an opportunity around ${idea}. ${cta}\n\n${optOutFor(platform)}`;
      break;
    case 'instagram':
      content = `Hi ${firstName}${warmStart ? '! 👋' : '!'} Came across ${company} and noticed an opportunity around ${idea}. ${cta}\n\n${optOutFor(platform)}`;
      break;
    case 'sms':
      content = `Hi ${firstName}—noticed ${company} may have an opportunity around ${idea}. ${cta} ${optOutFor(platform)}`;
      break;
    default:
      subject = clean(`Idea for ${company}: ${opportunity}`, 160);
      content = [
        `Hello ${firstName},`,
        `${warmStart ? 'I hope you are doing well. ' : ''}I ${concise ? 'reviewed' : 'was reviewing'} ${company}'s public presence and noticed an opportunity around ${idea}.`,
        cta,
        optOutFor(platform),
        tone === 'warm' ? 'Best wishes,' : tone === 'consultative' ? 'Regards,' : 'Thanks,',
      ].join('\n\n');
  }

  return {
    subject,
    content: truncateWithOptOut(content, platform),
    generator: 'grounded-platform-template-v2',
  };
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        return part.text;
      }
    }
  }
  return '';
}

function parseJsonText(text) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(normalized);
}

export async function generateGroundedOutreachDraft(input) {
  const fallback = fallbackDraft(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallback;

  const model = process.env.OPENAI_OUTREACH_MODEL?.trim() || 'gpt-5.6-luna';
  const platform = input.platform;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const prompt = {
      task: 'Write one personalized outbound message using only the verified evidence below.',
      channel: platform,
      channel_style: CHANNEL_STYLES[platform],
      maximum_characters: limitFor(platform),
      tone: input.tone,
      goal: input.goal,
      verified_evidence: {
        contact_first_name: clean(input.contact.first_name, 80),
        contact_job_title: clean(input.contact.job_title, 120),
        company_name: clean(input.lead.company_name, 140),
        industry: clean(input.lead.industry, 120),
        location: clean(input.lead.location, 160),
        opportunity: clean(input.opportunity, 300),
        research_summary: input.researchSummary,
      },
      rules: [
        'Do not invent familiarity, private facts, performance claims, results, or customer details.',
        'Use a different native writing style for the selected channel.',
        'Include exactly one clear call to action.',
        `Include this opt-out meaning: ${optOutFor(platform)}`,
        platform === 'email' ? 'Return a specific subject and body.' : 'Return null for subject.',
        'Return JSON only with keys subject and content.',
      ],
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 700,
        input: JSON.stringify(prompt),
        text: {
          format: {
            type: 'json_schema',
            name: 'outreach_draft',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                subject: { type: ['string', 'null'] },
                content: { type: 'string' },
              },
              required: ['subject', 'content'],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('OpenAI outreach generation failed:', response.status);
      return fallback;
    }

    const payload = await response.json();
    const parsed = parseJsonText(extractResponseText(payload));
    const content = cleanContent(parsed.content, limitFor(platform));
    if (!content) return fallback;

    return {
      subject: platform === 'email' ? clean(parsed.subject || fallback.subject, 160) : null,
      content: truncateWithOptOut(content, platform),
      generator: `openai:${model}`,
    };
  } catch (error) {
    console.error('OpenAI outreach generation unavailable; using grounded fallback:', error?.message);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
