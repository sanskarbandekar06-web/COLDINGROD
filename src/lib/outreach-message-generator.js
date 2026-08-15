import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

const CHANNEL_LIMITS = {
  email: 1800,
  linkedin: 700,
  whatsapp: 500,
  instagram: 500,
  facebook: 500,
  sms: 320,
};

const CHANNEL_STYLES = {
  email: 'a clear business email with a specific subject, short paragraphs, and a professional sign-off',
  linkedin: 'a professional, peer-to-peer LinkedIn message; concise, credible, and connection-oriented',
  whatsapp: 'a brief, conversational WhatsApp message that feels natural on mobile and avoids email-like formality',
  instagram: 'a friendly, lightweight Instagram DM with a casual but respectful voice',
  facebook: 'a friendly Facebook Messenger note; conversational, specific, and respectful',
  sms: 'an extremely concise SMS with one idea, one question, and STOP opt-out wording',
};

const OPT_OUTS = {
  email: 'If this is not relevant, just let me know and I will not follow up.',
  linkedin: 'If it is not relevant, no worries — I will not follow up.',
  whatsapp: 'If it is not relevant, just say so and I will not follow up.',
  instagram: 'No worries if it is not a fit — I will not follow up.',
  facebook: 'No worries if it is not a fit — I will not follow up.',
  sms: 'Reply STOP to opt out.',
};

const GOAL_COPY = {
  book_call: {
    email: 'Would a short 15-minute conversation next week be useful?',
    linkedin: 'Open to a quick 15-minute chat next week?',
    whatsapp: 'Would a quick 15-minute chat next week be useful?',
    instagram: 'Open to a quick 15-minute chat next week?',
    facebook: 'Open to a quick 15-minute chat next week?',
    sms: 'Open to a 15-min chat next week?',
  },
  offer_audit: {
    email: 'I can share a concise audit with a few practical next steps if that would help.',
    linkedin: 'Happy to share a short audit with a few practical next steps — useful?',
    whatsapp: 'I can send a short audit with a few practical next steps if useful.',
    instagram: 'Want me to send a quick audit with a few practical next steps?',
    facebook: 'Want me to send a quick audit with a few practical next steps?',
    sms: 'Want a short audit with practical next steps?',
  },
  share_idea: {
    email: 'Would it be helpful if I sent over one concrete idea?',
    linkedin: 'Would it help if I shared one concrete idea?',
    whatsapp: 'Want me to send one concrete idea?',
    instagram: 'Want me to send one practical idea?',
    facebook: 'Want me to send one practical idea?',
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

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function seededNumber(value) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}

function sentence(value, maximum = 260) {
  return clean(value, maximum).replace(/[.;:,\s]+$/, '');
}

function lowerFirst(value) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function researchBasis(input, variant) {
  const summary = record(input.executiveSummary)
    ? input.executiveSummary
    : record(input.researchSummary)
      ? input.researchSummary
      : {};
  const details = Array.isArray(input.detailedAnalysis)
    ? input.detailedAnalysis.filter(record)
    : [];
  const specificDetails = details.filter((point) =>
    sentence(point.evidence, 280) &&
    !/unknown|no performance claim/i.test(sentence(point.evidence, 280)),
  );
  const detailPool = specificDetails.length ? specificDetails : details;
  const point = detailPool.length ? detailPool[variant % detailPool.length] : null;
  const summaryPool = [
    summary.offerings,
    summary.observed_challenges,
    summary.differentiators,
    summary.target_audience,
    summary.recent_activity,
  ].map((value) => sentence(value, 260)).filter(Boolean);
  const summaryInsight = summaryPool.length
    ? summaryPool[(variant >>> 3) % summaryPool.length]
    : '';
  return {
    insight: sentence(point?.evidence, 240) || summaryInsight ||
      sentence(input.lead.industry || input.lead.location, 180) ||
      'its current public customer journey',
    context: summaryInsight || sentence(input.lead.industry, 140) ||
      'the business’s public profile',
    opportunity: sentence(point?.service_opportunity, 220) ||
      sentence(input.opportunity, 220) || 'an evidence-led growth review',
    reportFinding: sentence(point?.label, 140) || 'public-profile opportunity',
  };
}

function pick(values, variant, offset = 0) {
  return values[(variant + offset) % values.length];
}

function fallbackDraft(input) {
  const { platform, tone, goal, lead, contact } = input;
  const firstName = clean(contact.first_name, 80) || 'there';
  const company = clean(lead.company_name, 140);
  const variationKey = input.variationKey || randomUUID();
  const variant = seededNumber(
    `${lead.id || company}|${platform}|${tone}|${goal}|${variationKey}`,
  );
  const basis = researchBasis(input, variant);
  const insight = sentence(basis.insight, platform === 'sms' ? 80 : 190);
  const idea = sentence(basis.opportunity, platform === 'sms' ? 70 : 150).toLowerCase();
  const cta = GOAL_COPY[goal]?.[platform] ?? GOAL_COPY.share_idea[platform];
  const warmStart = tone === 'warm';
  let subject = null;
  let content;

  switch (platform) {
    case 'linkedin':
      content = pick([
        `Hi ${firstName} — I reviewed ${company}'s public profile and one detail stood out: ${insight}. I have a focused idea around ${idea}. ${cta}`,
        `Hi ${firstName}${warmStart ? ' — hope your week is going well.' : '.'} The lead analysis for ${company} highlighted ${lowerFirst(insight)}. It points to a practical opportunity around ${idea}. ${cta}`,
        `Hi ${firstName} — while looking at ${company}, I focused on ${basis.context}. The detailed review surfaced ${lowerFirst(insight)}. ${cta}`,
      ], variant) + `\n\n${optOutFor(platform)}`;
      break;
    case 'whatsapp':
      content = pick([
        `Hi ${firstName}${warmStart ? ' 👋' : ','} I took a look at ${company}. One thing the analysis picked up was ${lowerFirst(insight)}. I have a practical idea around ${idea}. ${cta}`,
        `Hi ${firstName}, I was reviewing ${company} and noticed ${lowerFirst(insight)}. It may be worth exploring ${idea}. ${cta}`,
        `Hi ${firstName}${warmStart ? '!' : ','} Quick note after looking through ${company}'s public presence: ${insight}. ${cta}`,
      ], variant) + `\n\n${optOutFor(platform)}`;
      break;
    case 'instagram':
    case 'facebook':
      content = pick([
        `Hi ${firstName}${warmStart ? '! 👋' : '!'} I came across ${company} and noticed ${lowerFirst(insight)}. I have one idea around ${idea}. ${cta}`,
        `Hey ${firstName} — I was looking through ${company}'s public profile. The review highlighted ${lowerFirst(insight)}. ${cta}`,
        `Hi ${firstName}! A quick observation from ${company}'s analysis: ${insight}. There may be a useful next step around ${idea}. ${cta}`,
      ], variant) + `\n\n${optOutFor(platform)}`;
      break;
    case 'sms':
      content = pick([
        `Hi ${firstName}—reviewed ${company} and noticed ${lowerFirst(insight)}. ${cta} ${optOutFor(platform)}`,
        `Hi ${firstName}—quick idea for ${company} around ${idea}. ${cta} ${optOutFor(platform)}`,
        `Hi ${firstName}—${basis.reportFinding} stood out in ${company}'s review. ${cta} ${optOutFor(platform)}`,
      ], variant);
      break;
    default:
      subject = clean(pick([
        `${basis.reportFinding} idea for ${company}`,
        `A practical ${company} growth idea`,
        `${company}: ${basis.opportunity}`,
      ], variant), 160);
      content = [
        warmStart ? `Hi ${firstName},` : `Hello ${firstName},`,
        pick([
          `I reviewed both the executive summary and detailed analysis for ${company}. One verified detail stood out: ${insight}. That suggests a focused opportunity around ${idea}.`,
          `While looking through ${company}'s public presence, I focused on ${basis.context}. The detailed review highlighted ${lowerFirst(insight)}, so I sketched a practical idea around ${idea}.`,
          `The research summary for ${company} shows ${basis.context}. The deeper analysis also surfaced ${lowerFirst(insight)}. There may be a useful next step around ${idea}.`,
        ], variant),
        cta,
        optOutFor(platform),
        tone === 'warm' ? 'Best wishes,' : tone === 'consultative' ? 'Regards,' : 'Thanks,',
      ].join('\n\n');
  }

  return {
    subject,
    content: truncateWithOptOut(content, platform),
    generator: 'report-grounded-platform-writer-v3',
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

function normalizedDraft(value) {
  return cleanContent(value, 10_000).toLowerCase();
}

function distinctFallback(input) {
  const previous = new Set(
    (input.avoidMessages ?? []).map(normalizedDraft).filter(Boolean),
  );
  let candidate = fallbackDraft({
    ...input,
    variationKey: `${input.variationKey}:0`,
  });
  if (!previous.has(normalizedDraft(candidate.content))) return candidate;
  for (let attempt = 1; attempt < 8; attempt += 1) {
    candidate = fallbackDraft({
      ...input,
      variationKey: `${input.variationKey}:${attempt}`,
    });
    if (!previous.has(normalizedDraft(candidate.content))) return candidate;
  }
  return candidate;
}

export async function generateGroundedOutreachDraft(input) {
  const normalizedInput = {
    ...input,
    variationKey: input.variationKey || randomUUID(),
  };
  const fallback = distinctFallback(normalizedInput);
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
        executive_summary: input.executiveSummary ?? input.researchSummary,
        detailed_analysis: input.detailedAnalysis,
        source_urls: input.sourceUrls,
      },
      previous_drafts_to_avoid: (input.avoidMessages ?? []).slice(0, 5),
      variation_key: normalizedInput.variationKey,
      rules: [
        'Do not invent familiarity, private facts, performance claims, results, or customer details.',
        'Use a different native writing style for the selected channel.',
        'Ground the opening in a specific fact from the executive summary and a finding from the detailed analysis.',
        'Do not repeat the wording, opening, or CTA construction of previous drafts.',
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
    const previous = new Set(
      (input.avoidMessages ?? []).map(normalizedDraft).filter(Boolean),
    );
    if (previous.has(normalizedDraft(content))) return fallback;

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
