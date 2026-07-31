import { getWorkspaceContext } from '@/services/workspace.service';
import { getPendingApprovalActions, getAiApprovals } from '@/services/ai-approval.service';
import type { ApprovalWithAction } from '@/services/ai-approval.service';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Approval Center | Coldingrod',
  description: 'Review and act on pending AI action approvals',
};

type TabValue = 'pending' | 'approved' | 'rejected';

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) redirect('/dashboard');

  const hasAiPerm = context.permissions.includes('manage_ai');

  const tabParam = typeof searchParams.tab === 'string' ? searchParams.tab : 'pending';
  const tab: TabValue = ['pending', 'approved', 'rejected'].includes(tabParam)
    ? (tabParam as TabValue)
    : 'pending';

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) || 1 : 1;

  const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
    getPendingApprovalActions(context.workspace.id, tab === 'pending' ? page : 1, 20),
    tab === 'approved'
      ? getAiApprovals({ workspaceId: context.workspace.id, decision: 'approved', page })
      : { data: [], count: 0, page: 1, limit: 20, totalPages: 0 },
    tab === 'rejected'
      ? getAiApprovals({ workspaceId: context.workspace.id, decision: 'rejected', page })
      : { data: [], count: 0, page: 1, limit: 20, totalPages: 0 },
  ]);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {
      tab,
      ...(page > 1 ? { page: String(page) } : {}),
    };
    Object.assign(base, overrides);
    Object.keys(base).forEach(k => base[k] === undefined && delete base[k]);
    return `?${new URLSearchParams(base as Record<string, string>).toString()}`;
  }

  const pendingCount = pendingResult.count;
  const tabs = [
    { id: 'pending', label: 'Pending', count: pendingCount, icon: Clock, urgent: pendingCount > 0 },
    { id: 'approved', label: 'Approved', count: approvedResult.count, icon: CheckCircle },
    { id: 'rejected', label: 'Rejected', count: rejectedResult.count, icon: XCircle },
  ];

  const currentData = tab === 'pending'
    ? pendingResult
    : tab === 'approved'
    ? approvedResult
    : rejectedResult;

  const decidedApprovals: ApprovalWithAction[] = tab === 'approved'
    ? approvedResult.data
    : tab === 'rejected'
      ? rejectedResult.data
      : [];

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href={`/dashboard/${params.workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
            <span>/</span>
            <span>Approval Center</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Approval Center</h2>
          <p className="text-muted-foreground mt-1">
            Review AI-generated actions before they are executed.
          </p>
        </div>
      </div>

      {!hasAiPerm && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">Read-only view.</span> You need the{' '}
          <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">manage_ai</code>{' '}
          permission to approve or reject actions.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <Link
            key={t.id}
            href={buildUrl({ tab: t.id, page: '1' })}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${
              t.urgent ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
              tab === t.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {t.id === 'pending' ? pendingCount : t.count}
            </span>
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="rounded-lg border bg-card divide-y">
        {tab === 'pending' && pendingResult.data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No pending approvals</h3>
            <p className="text-sm text-muted-foreground">
              All AI actions have been reviewed. Check back later.
            </p>
          </div>
        )}

        {tab === 'pending' && pendingResult.data.map((action) => (
          <div key={action.id} className="flex items-center justify-between p-4 hover:bg-muted/20">
            <div className="flex items-center gap-4 min-w-0">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-950/50 p-2 flex-shrink-0">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{action.action_type.replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{action.agent?.name || 'Unknown agent'}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground font-mono">{action.entity_type}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                    action.priority === 'critical' ? 'bg-rose-100 text-rose-700' :
                    action.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {action.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Requested {format(new Date(action.created_at), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
            {hasAiPerm && (
              <Link
                href={`/dashboard/${params.workspaceSlug}/ai/approvals/${action.id}`}
                className="flex-shrink-0 ml-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                aria-label={`Review action: ${action.action_type}`}
              >
                Review
              </Link>
            )}
            {!hasAiPerm && (
              <Link
                href={`/dashboard/${params.workspaceSlug}/ai/approvals/${action.id}`}
                className="flex-shrink-0 ml-4 text-sm text-primary hover:underline"
              >
                View →
              </Link>
            )}
          </div>
        ))}

        {/* Decided approvals */}
        {decidedApprovals.map((approval) => (
          <div key={approval.id} className="flex items-center justify-between p-4 hover:bg-muted/20">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`rounded-lg p-2 flex-shrink-0 ${
                approval.decision === 'approved'
                  ? 'bg-emerald-100 dark:bg-emerald-950/50'
                  : 'bg-rose-100 dark:bg-rose-950/50'
              }`}>
                {approval.decision === 'approved'
                  ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                  : <XCircle className="h-4 w-4 text-rose-600" />
                }
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {approval.ai_action?.action_type?.replace(/_/g, ' ') || 'Unknown action'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{approval.ai_action?.agent?.name || '—'}</span>
                  {approval.reason && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground italic line-clamp-1">&ldquo;{approval.reason}&rdquo;</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {approval.decision === 'approved' ? 'Approved' : 'Rejected'} by {approval.approver?.full_name || '—'} ·{' '}
                  {format(new Date(approval.decided_at), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/${params.workspaceSlug}/ai/actions/${approval.ai_action_id}`}
              className="flex-shrink-0 ml-4 text-sm text-primary hover:underline"
            >
              View action →
            </Link>
          </div>
        ))}

        {(tab === 'approved' || tab === 'rejected') && decidedApprovals.length === 0 && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            No {tab} approvals found.
          </div>
        )}
      </div>

      {/* Pagination */}
      {currentData.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentData.page} of {currentData.totalPages}
          </p>
          <div className="flex gap-2">
            {currentData.page > 1 && (
              <Link href={buildUrl({ page: String(currentData.page - 1) })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            )}
            {currentData.page < currentData.totalPages && (
              <Link href={buildUrl({ page: String(currentData.page + 1) })}
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
