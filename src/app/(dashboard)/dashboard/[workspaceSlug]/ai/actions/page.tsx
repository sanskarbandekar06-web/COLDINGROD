import { getWorkspaceContext } from '@/services/workspace.service';
import { getAiActions } from '@/services/ai-action.service';
import { getAgents } from '@/services/ai-agent.service';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { AiActionStatus } from '@/types/ai';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Action History | Coldingrod',
  description: 'Browse all AI action records',
};

const STATUS_OPTIONS: { value: AiActionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executing', label: 'Executing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

function statusClass(status: string) {
  switch (status) {
    case 'pending_approval': return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400';
    case 'approved': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400';
    case 'rejected': return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400';
    case 'executing': return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400';
    case 'completed': return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400';
    case 'failed': return 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400';
    default: return 'bg-muted text-muted-foreground';
  }
}

export default async function AiActionsPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) redirect('/dashboard');

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) || 1 : 1;
  const statusParam = typeof searchParams.status === 'string' ? searchParams.status : 'all';
  const agentId = typeof searchParams.agentId === 'string' ? searchParams.agentId : undefined;
  const entityType = typeof searchParams.entityType === 'string' ? searchParams.entityType : undefined;

  const validStatuses: string[] = ['pending_approval', 'approved', 'rejected', 'executing', 'completed', 'failed', 'all'];
  const status = validStatuses.includes(statusParam) ? (statusParam as AiActionStatus | 'all') : 'all';

  const [actionsResult, agentsResult] = await Promise.all([
    getAiActions({
      workspaceId: context.workspace.id,
      page,
      status,
      agentId,
      entityType,
    }),
    getAgents({ workspaceId: context.workspace.id, limit: 100 }),
  ]);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params: Record<string, string> = {
      page: '1',
      ...(status !== 'all' ? { status } : {}),
      ...(agentId ? { agentId } : {}),
      ...(entityType ? { entityType } : {}),
    };
    Object.assign(params, overrides);
    // Remove undefined
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);
    return `?${new URLSearchParams(params as Record<string, string>).toString()}`;
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href={`/dashboard/${params.workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
            <span>/</span>
            <span>Action History</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">AI Action History</h2>
          <p className="text-muted-foreground mt-1">
            All AI actions recorded in this workspace.{' '}
            <span className="text-xs">(Derived — not a persisted metric)</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={buildUrl({ status: opt.value === 'all' ? undefined : opt.value })}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              (status === opt.value) || (status === 'all' && opt.value === 'all')
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input hover:bg-muted'
            }`}
          >
            {opt.label}
          </Link>
        ))}

        {agentId && (
          <Link
            href={buildUrl({ agentId: undefined })}
            className="px-3 py-1.5 text-sm rounded-full border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:opacity-80"
          >
            Agent: {agentsResult.data.find(a => a.id === agentId)?.name || agentId.slice(0, 8)} ×
          </Link>
        )}
      </div>

      {/* Actions table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr className="text-left">
              <th className="p-4 font-medium text-muted-foreground">Action Type</th>
              <th className="p-4 font-medium text-muted-foreground">Agent</th>
              <th className="p-4 font-medium text-muted-foreground">Entity</th>
              <th className="p-4 font-medium text-muted-foreground">Status</th>
              <th className="p-4 font-medium text-muted-foreground">Priority</th>
              <th className="p-4 font-medium text-muted-foreground">Created</th>
              <th className="p-4 font-medium text-muted-foreground">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {actionsResult.data.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Activity className="h-8 w-8 text-muted-foreground/50" />
                    <p>No AI actions found{status !== 'all' ? ` with status "${status}"` : ''}.</p>
                  </div>
                </td>
              </tr>
            ) : (
              actionsResult.data.map((action) => (
                <tr key={action.id} className="hover:bg-muted/30">
                  <td className="p-4">
                    <Link
                      href={`/dashboard/${params.workspaceSlug}/ai/actions/${action.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {action.action_type.replace(/_/g, ' ')}
                    </Link>
                    {action.payloadSummary && (
                      <p className="text-xs text-muted-foreground mt-0.5">{action.payloadSummary}</p>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {action.agent?.name ? (
                      <Link
                        href={`/dashboard/${params.workspaceSlug}/ai/agents/${action.agent_id}`}
                        className="hover:underline"
                      >
                        {action.agent.name}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    <span className="text-xs font-mono">{action.entity_type}</span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium capitalize ${statusClass(action.status)}`}>
                      {action.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-xs capitalize text-muted-foreground">{action.priority}</span>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {format(new Date(action.created_at), 'MMM d, h:mm a')}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {action.finished_at ? format(new Date(action.finished_at), 'MMM d, h:mm a') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {actionsResult.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {actionsResult.page} of {actionsResult.totalPages} · {actionsResult.count} total
          </p>
          <div className="flex gap-2">
            {actionsResult.page > 1 && (
              <Link href={buildUrl({ page: String(actionsResult.page - 1) })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            )}
            {actionsResult.page < actionsResult.totalPages && (
              <Link href={buildUrl({ page: String(actionsResult.page + 1) })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
