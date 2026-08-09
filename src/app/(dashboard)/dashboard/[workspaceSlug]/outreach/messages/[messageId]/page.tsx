import { getWorkspaceContext } from '@/services/workspace.service';
import { getOutreachMessageDetail } from '@/services/outreach.service';
import { EDITABLE_STATUSES, type OutreachPlatform, type OutreachStatus } from '@/types/outreach';
import { getMessageVersions } from '@/services/message-version.service';
import { computeReadiness } from '@/services/outreach-readiness.service';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { OutreachStatusBadge } from '@/components/outreach/OutreachStatusBadge';
import { ChannelBadge } from '@/components/outreach/ChannelBadge';
import { ChannelPreview } from '@/components/outreach/ChannelPreview';
import { MessageVersionHistory } from '@/components/outreach/MessageVersionHistory';
import { SendReadinessPanel } from '@/components/outreach/SendReadinessPanel';
import { OutreachActivityTimeline } from '@/components/outreach/OutreachActivityTimeline';
import { FollowUpSequencePanel } from '@/components/outreach/FollowUpSequencePanel';
import { CompanionDeliveryPanel } from '@/components/outreach/CompanionDeliveryPanel';
import { EditMessageDialog } from '@/components/outreach/EditMessageDialog';
import { CopyButton } from '@/components/outreach/CopyButton';
import { ArchiveRestoreButton } from '@/components/outreach/ArchiveRestoreButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { Activity } from '@/types/lead';
import { ArrowLeft, Bot, User, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { getFollowUpSequenceForMessage } from '@/services/follow-up.service';

export default async function MessageDetailPage(props: {
  params: Promise<{ workspaceSlug: string; messageId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const { workspace } = context;

  const [message, versions, followUpSequence] = await Promise.all([
    getOutreachMessageDetail(workspace.id, params.messageId),
    getMessageVersions(workspace.id, params.messageId, 20),
    getFollowUpSequenceForMessage(workspace.id, params.messageId),
  ]);

  if (!message) notFound();

  // Fetch message-scoped activities
  const supabase = await createClient();
  const { data: rawActivities } = await supabase
    .from('activities')
    .select('*, actor_user:users!actor_user_id(id, full_name)')
    .eq('workspace_id', workspace.id)
    .eq('entity_type', 'outreach_message')
    .eq('entity_id', message.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const activities = (rawActivities ?? []) as Activity[];

  const canManage = context.permissions.includes('manage_leads');

  // Determine editability (mirrors server action logic for UI state)
  const aiAction = message.ai_action as { id?: string; status?: string } | null;
  const aiApproval = message.ai_approval as { decision?: string } | null;

  let canEdit = false;
  let editBlockedReason: string | undefined;

  if (message.deleted_at !== null) {
    editBlockedReason = 'Archived messages cannot be edited.';
  } else if ((EDITABLE_STATUSES as string[]).includes(message.status)) {
    canEdit = canManage;
  } else if (message.status === 'pending_approval') {
    if (aiApproval) {
      editBlockedReason = `Cannot edit: already ${aiApproval.decision} by a reviewer.`;
    } else {
      canEdit = canManage;
    }
  } else {
    editBlockedReason = `Messages with status '${message.status}' cannot be edited.`;
  }

  if (!canManage && !editBlockedReason) {
    editBlockedReason = 'You do not have permission to edit messages.';
  }

  // AI action state display
  const isAiGenerated = Boolean(message.ai_action_id);
  const actionStatus = aiAction?.status as string | undefined;
  const approvalDecision = aiApproval?.decision as string | undefined;

  // Compute readiness
  const readiness = computeReadiness(message);

  // Approved payload check
  const approvedPayload = message.ai_approval?.approved_payload;
  const approvalDetails = message.ai_approval as {
    decision?: string;
    reason?: string | null;
    decided_at?: string;
    approver?: { full_name?: string | null } | null;
    approved_payload?: Record<string, unknown> | null;
  } | null;

  const lead = message.lead;
  const contact = message.contact as {
    id?: string;
    first_name?: string;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
    instagram_handle?: string | null;
    facebook_url?: string | null;
    job_title?: string | null;
    is_primary?: boolean;
  } | null;


  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          render={
            <Link
              href={`/dashboard/${params.workspaceSlug}/outreach/messages`}
              aria-label="Back to messages"
            />
          }
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex-1">
          <PageHeader
            title={lead?.company_name ?? 'Outreach Message'}
            description={`${message.platform.charAt(0).toUpperCase() + message.platform.slice(1)} · ${message.direction} message`}
            action={
              <div className="flex items-center gap-2 flex-wrap">
                {canManage && message.deleted_at === null && (
                  <EditMessageDialog
                    workspaceSlug={params.workspaceSlug}
                    workspaceId={workspace.id}
                    messageId={message.id}
                    currentContent={message.content}
                    currentSubject={message.subject}
                    platform={message.platform}
                    defaultOpen={searchParams.edit === '1' && canEdit}
                    canEdit={canEdit}
                    editBlockedReason={editBlockedReason}
                  />
                )}
                <CopyButton text={message.content} label="Copy message" />
                {canManage && (
                  <ArchiveRestoreButton
                    workspaceSlug={params.workspaceSlug}
                    workspaceId={workspace.id}
                    messageId={message.id}
                    isArchived={message.deleted_at !== null}
                  />
                )}
              </div>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <SectionCard title="Message Overview">
            <div className="flex flex-wrap gap-2 mb-4">
              <OutreachStatusBadge status={message.status as OutreachStatus} />
              <ChannelBadge platform={message.platform as OutreachPlatform} />
              {isAiGenerated && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Bot className="h-3 w-3" aria-hidden="true" /> AI Generated
                </Badge>
              )}
              {message.deleted_at !== null && (
                <Badge variant="destructive">Archived</Badge>
              )}
            </div>

            {message.subject && (
              <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Subject</p>
                {/* Plain text — no HTML */}
                <p className="text-sm font-medium">{message.subject}</p>
              </div>
            )}

            <div className="mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Message Content</p>
            </div>
          </SectionCard>

          {/* Channel Preview */}
          <div>
            <h2 className="text-sm font-semibold mb-2">Channel Preview</h2>
            <ChannelPreview
              platform={message.platform as OutreachPlatform}
              content={message.content}
              subject={message.subject}
            />
          </div>

          {/* AI Context */}
          {isAiGenerated && (
            <SectionCard
              title="AI Generation Context"
              description="This message was generated by an AI agent."
            >
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-muted-foreground">Source:</span>
                  <span>AI Generated</span>
                </div>
                {aiAction?.status && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">AI Action Status:</span>
                    <Badge variant="outline" className="text-xs">
                      {actionStatus}
                    </Badge>
                  </div>
                )}
                {message.ai_action_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    render={<Link
                      href={`/dashboard/${params.workspaceSlug}/ai/actions/${message.ai_action_id}`}
                      aria-label="View linked AI action"
                    />}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    View AI Action
                  </Button>
                )}
              </div>
            </SectionCard>
          )}

          {/* Approval State */}
          {isAiGenerated && (
            <SectionCard title="Approval State">
              {!approvalDetails ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    {actionStatus === 'pending_approval'
                      ? 'This message is awaiting approval review.'
                      : 'No approval decision recorded.'}
                  </p>
                  {actionStatus === 'pending_approval' && message.ai_action_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/${params.workspaceSlug}/ai/approvals`} />}
                    >
                      Go to Approval Center
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Decision:</span>
                    <Badge
                      variant={approvalDecision === 'approved' ? 'default' : 'destructive'}
                    >
                      {approvalDecision}
                    </Badge>
                  </div>
                  {approvalDetails.approver && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-muted-foreground">Reviewer:</span>
                      <span>{approvalDetails.approver.full_name ?? 'Unknown'}</span>
                    </div>
                  )}
                  {approvalDetails.decided_at && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Decided:</span>
                      <time dateTime={approvalDetails.decided_at}>
                        {formatDistanceToNow(new Date(approvalDetails.decided_at), {
                          addSuffix: true,
                        })}
                      </time>
                    </div>
                  )}
                  {approvalDetails.reason && (
                    <div>
                      <span className="text-muted-foreground">Reason: </span>
                      {/* Plain text — no HTML */}
                      <span>{approvalDetails.reason}</span>
                    </div>
                  )}

                  {/* Approved payload note */}
                  {approvedPayload ? (
                    <div className="mt-2 rounded-lg border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground">
                      <p className="font-medium mb-1">Approval Snapshot</p>
                      <p>
                        An approved_payload was recorded at decision time.
                        The content shown above is the current active content.
                        {editBlockedReason
                          ? ' Editing is blocked because a decision was already recorded.'
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground">
                      <p>
                        Approval recorded, but Database v1.0 does not store an approved_payload
                        snapshot identifying the exact approved version for this record.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

          {/* Version History */}
          <SectionCard title="Version History" description="Append-only audit trail of all edits.">
            <MessageVersionHistory
              versions={versions}
              currentContent={message.content}
            />
          </SectionCard>

          {/* Activity */}
          <SectionCard title="Activity Timeline">
            <OutreachActivityTimeline activities={activities} />
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Recipient */}
          <SectionCard title="Recipient">
            {lead ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lead</p>
                  <Link
                    href={`/dashboard/${params.workspaceSlug}/leads/${lead.id}`}
                    className="font-medium hover:underline flex items-center gap-1"
                    aria-label={`View lead: ${lead.company_name}`}
                  >
                    {lead.company_name}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                  {lead.status && (
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{lead.status}</p>
                  )}
                </div>
                {contact && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Contact</p>
                    <p className="font-medium">
                      {contact.first_name} {contact.last_name ?? ''}
                    </p>
                    {contact.job_title && (
                      <p className="text-xs text-muted-foreground">{contact.job_title}</p>
                    )}
                    {contact.is_primary && (
                      <Badge variant="outline" className="text-xs mt-1">Primary</Badge>
                    )}
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {contact.email && <p>✉ {contact.email}</p>}
                      {contact.phone && <p>📞 {contact.phone}</p>}
                      {contact.linkedin_url && <p>in: {contact.linkedin_url}</p>}
                      {contact.instagram_handle && <p>@ {contact.instagram_handle}</p>}
                      {contact.facebook_url && <p>f: {contact.facebook_url}</p>}
                    </div>
                  </div>
                )}
                {!contact && (
                  <p className="text-xs text-muted-foreground">No contact linked.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Lead data not available.</p>
            )}
          </SectionCard>

          {/* Send Readiness */}
          <SectionCard title="Send Readiness">
            <SendReadinessPanel summary={readiness} />
          </SectionCard>

          <SectionCard
            title="Send from Coldingrod"
            description="Prepare the approved message through the paired Browser Companion without leaving this workflow."
          >
            <CompanionDeliveryPanel
              workspaceSlug={params.workspaceSlug}
              workspaceId={workspace.id}
              message={{
                id: message.id,
                platform: message.platform,
                subject: message.subject,
                content: message.content,
                status: message.status,
              }}
              contact={contact}
              isReady={readiness.isReady}
              canManage={canManage}
            />
          </SectionCard>

          <SectionCard
            title="Follow-Up Automation"
            description="Response-aware timing with mandatory review for every draft."
          >
            <FollowUpSequencePanel
              workspaceSlug={params.workspaceSlug}
              currentMessageId={message.id}
              messageStatus={message.status}
              approvalDecision={approvalDecision}
              isAiGenerated={isAiGenerated}
              canManage={
                canManage && context.permissions.includes('manage_ai')
              }
              sequence={followUpSequence}
            />
          </SectionCard>

          {/* Metadata */}
          <SectionCard title="Details">
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Created</span>
                <time dateTime={message.created_at}>
                  {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                </time>
              </div>
              <div className="flex justify-between">
                <span>Updated</span>
                <time dateTime={message.updated_at}>
                  {formatDistanceToNow(new Date(message.updated_at), { addSuffix: true })}
                </time>
              </div>
              <div className="flex justify-between">
                <span>Direction</span>
                <span className="capitalize">{message.direction}</span>
              </div>
              {message.sent_at && (
                <div className="flex justify-between">
                  <span>Sent at</span>
                  <time dateTime={message.sent_at}>
                    {formatDistanceToNow(new Date(message.sent_at), { addSuffix: true })}
                  </time>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
