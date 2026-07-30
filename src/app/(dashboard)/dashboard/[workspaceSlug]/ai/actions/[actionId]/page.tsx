import { getWorkspaceContext } from '@/services/workspace.service';
import { getAiActionDetails } from '@/services/ai-action.service';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { JsonViewer } from '@/components/ai/JsonViewer';
import { sanitizeConfig } from '@/services/ai-sanitizer.service';
import { AlertTriangle, CheckCircle, Clock, XCircle, Loader2, Activity } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Action Details | Coldingrod',
  description: 'Detailed view of an AI action',
};

// Allowed entity types for safe routing
const ALLOWED_ENTITY_TYPES: Record<string, (slug: string, id: string) => string> = {
  lead: (slug, id) => `/dashboard/${slug}/leads/${id}`,
  client: (slug, id) => `/dashboard/${slug}/clients/${id}`,
  project: (slug, id) => `/dashboard/${slug}/projects/${id}`,
  task: (slug) => `/dashboard/${slug}/tasks`, // tasks route to list for now
};

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: typeof Clock; color: string; label: string }> = {
    pending_approval: { icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 border-amber-200', label: 'Pending Approval' },
    approved: { icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border-emerald-200', label: 'Approved' },
    rejected: { icon: XCircle, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950 border-rose-200', label: 'Rejected' },
    executing: { icon: Loader2, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950 border-purple-200', label: 'Executing' },
    completed: { icon: CheckCircle, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 border-blue-200', label: 'Completed' },
    failed: { icon: AlertTriangle, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950 border-orange-200', label: 'Failed' },
  };

  const cfg = configs[status] || { icon: Activity, color: 'text-muted-foreground bg-muted', label: status };
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border ${cfg.color}`}>
      <Icon className="h-4 w-4" />
      {cfg.label}
    </span>
  );
}

export default async function AiActionDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; actionId: string }>;
}) {
  const { workspaceSlug, actionId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) redirect('/dashboard');

  const action = await getAiActionDetails(context.workspace.id, actionId);
  if (!action) notFound();

  // Safe entity link — only for allowlisted entity types
  const entityLink = action.entity_id && ALLOWED_ENTITY_TYPES[action.entity_type]
    ? ALLOWED_ENTITY_TYPES[action.entity_type](workspaceSlug, action.entity_id)
    : null;

  // Sanitize payload before rendering
  const sanitizedPayload = action.payload ? sanitizeConfig(action.payload) as Record<string, unknown> : null;
  const sanitizedResultData = action.result_data ? sanitizeConfig(action.result_data) as Record<string, unknown> : null;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 lg:pt-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/${workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
        <span>/</span>
        <Link href={`/dashboard/${workspaceSlug}/ai/actions`} className="hover:underline">Actions</Link>
        <span>/</span>
        <span className="text-foreground font-mono text-xs">{actionId.slice(0, 8)}…</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{action.action_type.replace(/_/g, ' ')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Entity: <span className="font-mono font-medium">{action.entity_type}</span>
            {action.entity_id && entityLink && (
              <> · <Link href={entityLink} className="text-primary hover:underline">View entity →</Link></>
            )}
            {action.entity_id && !entityLink && (
              <> · <span className="font-mono text-xs">{action.entity_id}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={action.status} />
          {action.status === 'pending_approval' && (
            <Link
              href={`/dashboard/${workspaceSlug}/ai/approvals/${action.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Review →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — metadata */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Details</h3>
            <div className="space-y-3 text-sm">
              {action.agent && (
                <div>
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <Link
                    href={`/dashboard/${workspaceSlug}/ai/agents/${action.agent_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {action.agent.name}
                  </Link>
                  <p className="text-xs text-muted-foreground font-mono">{action.agent.model}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="font-medium capitalize">{action.priority}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Retry Count</p>
                <p className="font-medium">{action.retry_count}</p>
              </div>
              {action.creator && (
                <div>
                  <p className="text-xs text-muted-foreground">Initiated By</p>
                  <p className="font-medium">{action.creator.full_name || '—'}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">{format(new Date(action.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              {action.started_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="font-medium">{format(new Date(action.started_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
              )}
              {action.finished_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Finished</p>
                  <p className="font-medium">{format(new Date(action.finished_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — payload, result, errors */}
        <div className="lg:col-span-2 space-y-4">
          {sanitizedPayload && (
            <div className="rounded-lg border bg-card p-5">
              <JsonViewer data={sanitizedPayload} label="Input Payload (sanitized)" />
            </div>
          )}

          {sanitizedResultData && (
            <div className="rounded-lg border bg-card p-5">
              <JsonViewer data={sanitizedResultData} label="Result Data (sanitized)" />
            </div>
          )}

          {action.status === 'failed' && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <p className="font-medium text-sm text-orange-700 dark:text-orange-300">Action Failed</p>
              </div>
              <p className="text-sm text-orange-600 dark:text-orange-400">
                This action encountered an error during execution. Review the result data above for details.
                Stack traces, environment variables, and credentials are not shown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
