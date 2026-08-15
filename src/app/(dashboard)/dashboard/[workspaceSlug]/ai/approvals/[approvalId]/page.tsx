import { getWorkspaceContext } from '@/services/workspace.service';
import { getApprovalDetails } from '@/services/ai-approval.service';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { JsonViewer } from '@/components/ai/JsonViewer';
import { ApprovalActions } from '@/components/ai/ApprovalActions';
import { sanitizeConfig } from '@/services/ai-sanitizer.service';
import { ArrowRight, CheckCircle, XCircle, Clock, Bot, FileText } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Review AI Action | Coldingrod',
  description: 'Approve or reject an AI action request',
};

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; approvalId: string }>;
}) {
  const { workspaceSlug, approvalId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) redirect('/dashboard');

  const hasAiPerm = context.permissions.includes('manage_ai');

  // approvalId here is actually the ai_action_id
  const details = await getApprovalDetails(context.workspace.id, approvalId);
  if (!details) notFound();

  const { action, approval, outreachMessage } = details;

  const isPending = action.status === 'pending_approval';
  const isDecided = !!approval;

  // Sanitize payloads before rendering
  const sanitizedPayload = action.payload ? sanitizeConfig(action.payload) as Record<string, unknown> : null;
  const sanitizedResultData = action.result_data ? sanitizeConfig(action.result_data) as Record<string, unknown> : null;
  const sanitizedApprovedPayload = approval?.approved_payload
    ? sanitizeConfig(approval.approved_payload) as Record<string, unknown>
    : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/${workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
        <span>/</span>
        <Link href={`/dashboard/${workspaceSlug}/ai/approvals`} className="hover:underline">Approvals</Link>
        <span>/</span>
        <span className="text-foreground font-mono text-xs">{approvalId.slice(0, 8)}…</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {action.action_type.replace(/_/g, ' ')}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 font-medium">
                <Clock className="h-4 w-4" /> Pending Review
              </span>
            )}
            {approval?.decision === 'approved' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <CheckCircle className="h-4 w-4" /> Approved
              </span>
            )}
            {approval?.decision === 'rejected' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-rose-600 font-medium">
                <XCircle className="h-4 w-4" /> Rejected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left sidebar */}
        <div className="space-y-4">
          {/* Agent info */}
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Agent</h3>
            {action.agent ? (
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Link
                    href={`/dashboard/${workspaceSlug}/ai/agents/${action.agent.id}`}
                    className="font-medium text-sm text-primary hover:underline"
                  >
                    {action.agent.name}
                  </Link>
                  <p className="text-xs text-muted-foreground font-mono">{action.agent.model}</p>
                  {action.agent.description && (
                    <p className="text-xs text-muted-foreground mt-1">{action.agent.description}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No agent linked</p>
            )}
          </div>

          {/* Action meta */}
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Details</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Entity Type</p>
                <p className="font-mono font-medium">{action.entity_type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="capitalize font-medium">{action.priority}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requested</p>
                <p>{format(new Date(action.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              {action.creator && (
                <div>
                  <p className="text-xs text-muted-foreground">Requested By</p>
                  <p>{action.creator.full_name || '—'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Previous decision */}
          {isDecided && approval && (
            <div className={`rounded-lg border p-5 space-y-3 ${
              approval.decision === 'approved'
                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20'
                : 'border-rose-200 bg-rose-50 dark:bg-rose-950/20'
            }`}>
              <h3 className="font-semibold text-sm uppercase tracking-wide">
                {approval.decision === 'approved' ? 'Approval Record' : 'Rejection Record'}
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Decision</p>
                  <p className={`font-medium capitalize ${
                    approval.decision === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}>{approval.decision}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reviewer</p>
                  <p>{approval.approver?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Decided At</p>
                  <p>{format(new Date(approval.decided_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
                {approval.reason && (
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="italic">&ldquo;{approval.reason}&rdquo;</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right — content area */}
        <div className="lg:col-span-2 space-y-5">
          {/* Outreach message if linked */}
          {outreachMessage && (
            <div className="rounded-lg border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Linked Outreach Message</h3>
              </div>
              <div className="space-y-2">
                {outreachMessage.subject && (
                  <div>
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="text-sm font-medium">{outreachMessage.subject}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Content</p>
                  {/* Content rendered as text — never as HTML */}
                  <pre className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-3 mt-1 font-sans leading-relaxed">
                    {outreachMessage.content}
                  </pre>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Platform: {outreachMessage.platform}</span>
                  <span>Status: {outreachMessage.status}</span>
                </div>
                {approval?.decision === 'approved' && (
                  <Link
                    href={`/dashboard/${workspaceSlug}/outreach/messages/${outreachMessage.id}#send-message`}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    {outreachMessage.platform === 'whatsapp'
                      ? 'Continue to Open WhatsApp'
                      : 'Continue to delivery'}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Payload */}
          {sanitizedPayload && (
            <div className="rounded-lg border bg-card p-5">
              <JsonViewer data={sanitizedPayload} label="Request Payload (sanitized)" />
            </div>
          )}

          {/* Result data */}
          {sanitizedResultData && (
            <div className="rounded-lg border bg-card p-5">
              <JsonViewer data={sanitizedResultData} label="Result Data (sanitized)" />
            </div>
          )}

          {/* Approved payload */}
          {sanitizedApprovedPayload && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-5">
              <JsonViewer data={sanitizedApprovedPayload} label="Approved Payload (sanitized)" />
            </div>
          )}

          {/* Approve / Reject UI (only for pending and permitted users) */}
          {isPending && hasAiPerm && (
            <ApprovalActions
              workspaceId={context.workspace.id}
              actionId={action.id}
              workspaceSlug={workspaceSlug}
            />
          )}

          {isPending && !hasAiPerm && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
              This action is awaiting approval. You need the <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">manage_ai</code> permission to make a decision.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
