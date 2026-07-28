/**
 * outreach-readiness.service.ts
 *
 * Derives a send-readiness summary from real database data.
 * No fake "ready" state is persisted; this is a pure derived computation.
 *
 * Checks performed:
 * 1. Message has content
 * 2. Platform (channel) is valid
 * 3. Contact exists for the recipient slot
 * 4. Contact supports the selected channel (has relevant field populated)
 * 5. Lead belongs to the workspace and is not soft-deleted
 * 6. Message is not archived (deleted_at is null)
 * 7. Message has not reached a terminal sent/delivered/replied status
 * 8. Approval state (if ai_action linked)
 *    - pending_approval → not ready (awaiting review)
 *    - approved (ai_action.status) + approval row exists → ready
 *    - rejected → not ready
 *    - no ai_action → approval not required, content ready if other checks pass
 *
 * We do NOT claim an integration is operational based solely on an integrations row.
 */

import { OutreachMessageDetail } from './outreach.service';

export interface ReadinessCheck {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ReadinessSummary {
  isReady: boolean;
  checks: ReadinessCheck[];
}

type ContactData = {
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
} | null;

function contactSupportsChannel(
  channel: string,
  contact: ContactData
): { supported: boolean; missing: string } {
  if (!contact) return { supported: false, missing: 'No contact selected' };

  switch (channel) {
    case 'email':
      return contact.email
        ? { supported: true, missing: '' }
        : { supported: false, missing: 'Contact has no email address' };
    case 'sms':
    case 'whatsapp':
      return contact.phone
        ? { supported: true, missing: '' }
        : { supported: false, missing: 'Contact has no phone number' };
    case 'linkedin':
      return contact.linkedin_url
        ? { supported: true, missing: '' }
        : { supported: false, missing: 'Contact has no LinkedIn URL' };
    case 'instagram':
      return contact.instagram_handle
        ? { supported: true, missing: '' }
        : { supported: false, missing: 'Contact has no Instagram handle' };
    case 'facebook':
      // No specific contact field for Facebook in Database v1.0
      return {
        supported: false,
        missing:
          'Facebook contact field not available in Database v1.0. (Limitation)',
      };
    default:
      return { supported: false, missing: `Unknown channel: ${channel}` };
  }
}

export function computeReadiness(
  message: OutreachMessageDetail
): ReadinessSummary {
  const checks: ReadinessCheck[] = [];

  // 1. Content exists
  const hasContent = Boolean(message.content && message.content.trim().length > 0);
  checks.push({
    label: 'Message has content',
    passed: hasContent,
    detail: hasContent ? undefined : 'Message body is empty',
  });

  // 2. Valid channel
  const validChannels = [
    'email',
    'linkedin',
    'whatsapp',
    'instagram',
    'facebook',
    'sms',
  ];
  const hasValidChannel = validChannels.includes(message.platform);
  checks.push({
    label: 'Valid channel selected',
    passed: hasValidChannel,
    detail: hasValidChannel ? message.platform : `Unknown channel: ${message.platform}`,
  });

  // 3. Recipient contact exists
  const hasContact = Boolean(message.contact_id && message.contact);
  checks.push({
    label: 'Recipient contact selected',
    passed: hasContact,
    detail: hasContact ? undefined : 'No contact linked to this message',
  });

  // 4. Contact supports channel
  if (hasContact && hasValidChannel) {
    const { supported, missing } = contactSupportsChannel(
      message.platform,
      message.contact as ContactData
    );
    checks.push({
      label: `Contact reachable via ${message.platform}`,
      passed: supported,
      detail: missing || undefined,
    });
  }

  // 5. Lead belongs to workspace
  const leadInWorkspace =
    Boolean(message.lead) &&
    message.lead?.workspace_id === message.workspace_id;
  checks.push({
    label: 'Lead verified in workspace',
    passed: Boolean(leadInWorkspace),
    detail: leadInWorkspace ? undefined : 'Lead not found or belongs to another workspace',
  });

  // 6. Not archived
  const notArchived = message.deleted_at === null;
  checks.push({
    label: 'Message is not archived',
    passed: notArchived,
    detail: notArchived ? undefined : 'Message has been archived',
  });

  // 7. Not already in terminal delivery state
  const terminalStatuses = ['sent', 'delivered', 'replied'];
  const notTerminal = !terminalStatuses.includes(message.status);
  checks.push({
    label: 'Not already delivered',
    passed: notTerminal,
    detail: notTerminal
      ? undefined
      : `Message status is '${message.status}' — already delivered`,
  });

  // 8. Approval state
  const aiAction = message.ai_action as {
    id?: string;
    status?: string;
  } | null;

  if (aiAction?.id) {
    const actionStatus = aiAction.status;
    const hasApprovalRecord = Boolean(message.ai_approval);
    const isApproved =
      actionStatus === 'approved' && hasApprovalRecord;
    const isPending = actionStatus === 'pending_approval';
    const isRejected = actionStatus === 'rejected';

    if (isPending) {
      checks.push({
        label: 'AI-generated content approved',
        passed: false,
        detail: 'Approval is still pending review',
      });
    } else if (isRejected) {
      checks.push({
        label: 'AI-generated content approved',
        passed: false,
        detail: 'Content was rejected by reviewer',
      });
    } else if (isApproved) {
      checks.push({
        label: 'AI-generated content approved',
        passed: true,
        detail: 'Reviewer has approved this message',
      });
    } else {
      checks.push({
        label: 'AI action state',
        passed: false,
        detail: `AI action status: ${actionStatus ?? 'unknown'}`,
      });
    }
  }

  const isReady = checks.every((c) => c.passed);

  return { isReady, checks };
}
