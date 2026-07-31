import { getWorkspaceContext } from '@/services/workspace.service';
import { getAiOverviewStats } from '@/services/ai-action.service';
import { getAiActions } from '@/services/ai-action.service';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, BarChart3, Bot, CheckCircle, Clock, Loader2, Sparkles, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'AI Center | Coldingrod',
  description: 'AI operations dashboard — agents, actions, and approvals',
};

export default async function AiOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) redirect('/dashboard');

  const hasAiPerm = context.permissions.includes('manage_ai');

  const [stats, recentActions] = await Promise.all([
    getAiOverviewStats(context.workspace.id),
    getAiActions({ workspaceId: context.workspace.id, limit: 5 }),
  ]);

  const statCards = [
    {
      label: 'Registered Agents',
      value: stats.totalAgents,
      icon: Bot,
      href: `/dashboard/${workspaceSlug}/ai/agents`,
      description: 'System and workspace agents',
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Pending Approvals',
      value: stats.pendingApprovals,
      icon: Clock,
      href: `/dashboard/${workspaceSlug}/ai/approvals`,
      description: 'Awaiting human review',
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      urgent: stats.pendingApprovals > 0,
    },
    {
      label: 'Approved (all time)',
      value: stats.approvedActions,
      icon: CheckCircle,
      href: `/dashboard/${workspaceSlug}/ai/actions?status=approved`,
      description: 'Actions approved by reviewers',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      label: 'Rejected (all time)',
      value: stats.rejectedActions,
      icon: XCircle,
      href: `/dashboard/${workspaceSlug}/ai/actions?status=rejected`,
      description: 'Actions rejected by reviewers',
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
    },
    {
      label: 'Currently Executing',
      value: stats.executingActions,
      icon: Loader2,
      href: `/dashboard/${workspaceSlug}/ai/actions?status=executing`,
      description: 'Actions in progress now',
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: 'Completed (30d)',
      value: stats.completedLast30Days,
      icon: Activity,
      href: `/dashboard/${workspaceSlug}/ai/actions?status=completed`,
      description: 'Completed in last 30 days',
      color: 'text-teal-500',
      bg: 'bg-teal-50 dark:bg-teal-950/30',
    },
    {
      label: 'Failed Actions',
      value: stats.failedActions,
      icon: AlertTriangle,
      href: `/dashboard/${workspaceSlug}/ai/actions?status=failed`,
      description: 'Actions that encountered errors',
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-bold tracking-[-0.05em] text-brand-navy sm:text-5xl">
              AI Command Center
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Human-controlled
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">
            Manage agents, monitor workflows, and review automated intelligence tasks.
          </p>
        </div>
      </div>

      {/* Permission notice for non-AI users */}
      {!hasAiPerm && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">Read-only view.</span> You need the{' '}
          <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">manage_ai</code>{' '}
          permission to approve or reject AI actions.
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-secondary/25 bg-gradient-to-br from-secondary/10 via-background to-primary/5 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-on-secondary shadow-sm">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                Phase 3 complete
              </p>
              <h3 className="mt-1 text-lg font-semibold">Auditable AI Automation</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Discover and qualify leads, research evidence, draft personalized
                outreach, manage follow-ups, and optimize the funnel with human control.
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/${workspaceSlug}/ai/analytics`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary shadow-sm transition-colors hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            View analytics
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`group relative rounded-lg border bg-card p-5 shadow-sm hover:shadow-md transition-shadow ${
              card.urgent ? 'ring-2 ring-amber-400 ring-offset-1' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                {card.urgent && (
                  <span className="inline-block mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Needs attention
                  </span>
                )}
              </div>
              <div className={`rounded-lg p-2.5 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} aria-hidden="true" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent actions */}
      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-semibold">Recent AI Actions</h3>
            <p className="text-sm text-muted-foreground">Last 5 actions across all agents</p>
          </div>
          <Link
            href={`/dashboard/${workspaceSlug}/ai/actions`}
            className="text-sm text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="divide-y">
          {recentActions.data.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No AI actions recorded yet.
            </div>
          ) : (
            recentActions.data.map((action) => (
              <div key={action.id} className="flex flex-col gap-3 p-4 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{action.action_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {action.agent?.name || 'Unknown agent'} · {action.entity_type}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                    action.status === 'pending_approval' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                    action.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                    action.status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' :
                    action.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' :
                    action.status === 'failed' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {action.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(action.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick navigation */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Agent Registry', desc: 'View all registered AI agents', href: `/dashboard/${workspaceSlug}/ai/agents`, icon: Bot },
          { label: 'Approval Queue', desc: 'Review pending AI actions', href: `/dashboard/${workspaceSlug}/ai/approvals`, icon: Clock },
          { label: 'Analytics', desc: 'Inspect funnel snapshots and guidance', href: `/dashboard/${workspaceSlug}/ai/analytics`, icon: BarChart3 },
          { label: 'Action History', desc: 'Browse all AI action records', href: `/dashboard/${workspaceSlug}/ai/actions`, icon: Activity },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="rounded-lg bg-primary/10 p-2.5">
              <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
