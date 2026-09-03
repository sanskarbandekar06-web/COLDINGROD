'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import { generateGroundedOutreachDraft } from '@/lib/outreach-message-generator';
import { ensureAutomaticLeadIntelligence } from '@/services/automatic-lead-intelligence.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORMS = ['email', 'linkedin', 'whatsapp', 'instagram', 'sms'];
const TONES = ['concise', 'consultative', 'warm'];
const GOALS = ['book_call', 'offer_audit', 'share_idea'];

export type GeneratePersonalizedOutreachResult =
  | {
      success: true;
      messageId: string;
      personalizationActionId: string;
      complianceActionId: string;
    }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'NOT_READY' | 'EXECUTION_FAILED';
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function generatePersonalizedOutreachAction(
  value: unknown,
): Promise<GeneratePersonalizedOutreachResult> {
  if (
    !isRecord(value) ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.leadId !== 'string' ||
    typeof value.contactId !== 'string' ||
    typeof value.platform !== 'string' ||
    typeof value.tone !== 'string' ||
    typeof value.goal !== 'string' ||
    value.workspaceSlug.trim().length === 0 ||
    value.workspaceSlug.trim().length > 120 ||
    !UUID_PATTERN.test(value.leadId) ||
    !UUID_PATTERN.test(value.contactId) ||
    !PLATFORMS.includes(value.platform) ||
    !TONES.includes(value.tone) ||
    !GOALS.includes(value.goal)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Choose a valid contact, channel, tone, and outreach goal.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getWorkspaceContext(workspaceSlug);
  if (
    !context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const [{ data: lead }, { data: initialContact }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, workspace_id, company_name, source, website_url, industry, location, business_email, business_phone',
      )
      .eq('id', value.leadId)
      .eq('workspace_id', context.workspace.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('lead_contacts')
      .select('id, lead_id, first_name, job_title, email, phone, linkedin_url, instagram_handle, facebook_url')
      .eq('id', value.contactId)
      .eq('lead_id', value.leadId)
      .maybeSingle(),
  ]);

  if (!lead || !initialContact) {
    return {
      success: false,
      code: 'NOT_READY',
      error: 'The selected lead or contact is no longer available.',
    };
  }

  let report;
  let contact = initialContact;
  let recentMessages: { content: string }[] = [];
  try {
    const prepared = await ensureAutomaticLeadIntelligence({
      supabase,
      workspaceId: context.workspace.id,
      lead,
    });
    report = prepared.report;
    const [{ data: refreshedContact }, { data: previousMessages }] = await Promise.all([
      supabase
        .from('lead_contacts')
        .select('id, lead_id, first_name, job_title, email, phone, linkedin_url, instagram_handle, facebook_url')
        .eq('id', value.contactId)
        .eq('lead_id', value.leadId)
        .maybeSingle(),
      supabase
        .from('outreach_messages')
        .select('content')
        .eq('workspace_id', context.workspace.id)
        .eq('lead_id', value.leadId)
        .eq('platform', value.platform)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    contact = refreshedContact ?? initialContact;
    recentMessages = previousMessages ?? [];
  } catch (error) {
    console.error('Automatic outreach preparation failed:', error instanceof Error ? error.message : error);
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The AI agents could not analyze this lead and prepare a draft.',
    };
  }

  const painPoints = Array.isArray(report?.pain_points) ? report.pain_points : [];
  const topPainPoint = isRecord(painPoints[0]) ? painPoints[0] : null;
  const opportunity =
    typeof topPainPoint?.service_opportunity === 'string'
      ? topPainPoint.service_opportunity.trim()
      : '';

  if (!report || !opportunity) {
    return {
      success: false,
      code: 'NOT_READY',
      error: 'Automatic public analysis did not produce a safe outreach basis.',
    };
  }

  const reachable =
    (value.platform === 'email' && Boolean(contact.email)) ||
    (value.platform === 'linkedin' && Boolean(contact.linkedin_url)) ||
    (value.platform === 'instagram' && Boolean(contact.instagram_handle)) ||
    ((value.platform === 'whatsapp' || value.platform === 'sms') && Boolean(contact.phone));
  if (!reachable) {
    return {
      success: false,
      code: 'NOT_READY',
      error: 'That contact is not reachable on the selected channel.',
    };
  }

  const draft = await generateGroundedOutreachDraft({
    platform: value.platform,
    tone: value.tone,
    goal: value.goal,
    lead,
    contact,
    opportunity,
    executiveSummary: isRecord(report.research_summary)
      ? report.research_summary
      : {},
    detailedAnalysis: painPoints,
    sourceUrls: Array.isArray(report.source_urls) ? report.source_urls : [],
    avoidMessages: recentMessages.map((message) => message.content),
  });

  const { data, error } = await supabase
    .rpc('generate_personalized_outreach_v2', {
      check_workspace_id: context.workspace.id,
      check_lead_id: value.leadId,
      outreach_input: {
        contact_id: value.contactId,
        platform: value.platform,
        tone: value.tone,
        goal: value.goal,
        subject: draft.subject,
        content: draft.content,
        generator: draft.generator,
      },
    })
    .single();

  if (error) {
    console.error('Personalized outreach generation failed:', error.message);
    if (error.code === '42501') {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'You no longer have permission to generate this outreach.',
      };
    }
    if (error.code === '22023') {
      const message = error.message.toLowerCase();
      return {
        success: false,
        code: 'NOT_READY',
        error: message.includes('research')
          ? 'Automatic lead analysis could not prepare a safe outreach basis.'
          : message.includes('reachable')
            ? 'That contact is not reachable on the selected channel.'
            : 'The lead, contact, or outreach choices are no longer valid.',
      };
    }
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      error: 'The outreach agents could not prepare this draft.',
    };
  }

  const result = data as unknown as {
    message_id: string;
    personalization_action_id: string;
    compliance_action_id: string;
  };
  const base = `/dashboard/${workspaceSlug}`;
  revalidatePath(`${base}/leads/${value.leadId}`);
  revalidatePath(`${base}/outreach/messages`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/ai/approvals`);
  revalidatePath(`${base}/activity`);

  return {
    success: true,
    messageId: result.message_id,
    personalizationActionId: result.personalization_action_id,
    complianceActionId: result.compliance_action_id,
  };
}

export async function suggestMorePersonalizedOutreachAction(
  value: unknown,
): Promise<GeneratePersonalizedOutreachResult> {
  if (
    !isRecord(value) ||
    typeof value.workspaceSlug !== 'string' ||
    typeof value.messageId !== 'string' ||
    value.workspaceSlug.trim().length === 0 ||
    value.workspaceSlug.trim().length > 120 ||
    !UUID_PATTERN.test(value.messageId)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'The message selection is invalid.',
    };
  }

  const workspaceSlug = value.workspaceSlug.trim();
  const context = await getWorkspaceContext(workspaceSlug);
  if (
    !context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const { data: sourceMessage, error } = await supabase
    .from('outreach_messages')
    .select(`
      id, lead_id, contact_id, platform, status, ai_action_id, deleted_at,
      ai_action:ai_actions!outreach_messages_ai_action_id_fkey(payload)
    `)
    .eq('id', value.messageId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle();

  if (error || !sourceMessage || sourceMessage.deleted_at) {
    return {
      success: false,
      code: 'NOT_READY',
      error: 'The source message is no longer available.',
    };
  }
  if (
    !sourceMessage.ai_action_id ||
    !sourceMessage.contact_id ||
    !['draft', 'pending_approval'].includes(sourceMessage.status)
  ) {
    return {
      success: false,
      code: 'NOT_READY',
      error: 'Suggest more is available for editable AI drafts before approval.',
    };
  }

  const actionRelation = Array.isArray(sourceMessage.ai_action)
    ? sourceMessage.ai_action[0]
    : sourceMessage.ai_action;
  const payload = isRecord(actionRelation?.payload) ? actionRelation.payload : {};
  const tone = typeof payload.tone === 'string' && TONES.includes(payload.tone)
    ? payload.tone
    : 'consultative';
  const goal = typeof payload.goal === 'string' && GOALS.includes(payload.goal)
    ? payload.goal
    : 'offer_audit';

  return generatePersonalizedOutreachAction({
    workspaceSlug,
    leadId: sourceMessage.lead_id,
    contactId: sourceMessage.contact_id,
    platform: sourceMessage.platform,
    tone,
    goal,
  });
}
