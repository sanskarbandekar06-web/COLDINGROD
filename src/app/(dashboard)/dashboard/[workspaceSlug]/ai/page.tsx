import { getWorkspaceContext } from '@/services/workspace.service';
import { getAiOverviewStats } from '@/services/ai-action.service';
import { getAiActions } from '@/services/ai-action.service';
import { notFound, redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { Bot, Clock, CheckCircle, XCircle, Loader2, AlertTriangle, Activity, Users } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'AI Center | Coldingrod',
  description: 'AI operations dashboard — agents, actions, and approvals',
};

export default async function AiOverviewPage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
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
      href: `./ai/agents`,
      description: 'System and workspace agents',
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Pending Approvals',
      value: stats.pendingApprovals,
      icon: Clock,
      href: `./ai/approvals`,
      description: 'Awaiting human review',
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      urgent: stats.pendingApprovals > 0,
    },
    {
      label: 'Approved (all time)',
      value: stats.approvedActions,
      icon: CheckCircle,
      href: `./ai/actions?status=approved`,
      description: 'Actions approved by reviewers',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      label: 'Rejected (all time)',
      value: stats.rejectedActions,
      icon: XCircle,
      href: `./ai/actions?status=rejected`,
      description: 'Actions rejected by reviewers',
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
    },
    {
      label: 'Currently Executing',
      value: stats.executingActions,
      icon: Loader2,
      href: `./ai/actions?status=executing`,
      description: 'Actions in progress now',
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: 'Completed (30d)',
      value: stats.completedLast30Days,
      icon: Activity,
      href: `./ai/actions?status=completed`,
      description: 'Completed in last 30 days',
      color: 'text-teal-500',
      bg: 'bg-teal-50 dark:bg-teal-950/30',
    },
    {
      label: 'Failed Actions',
      value: stats.failedActions,
      icon: AlertTriangle,
      href: `./ai/actions?status=failed`,
      description: 'Actions that encountered errors',
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">AI Center</h2>
          <p className="text-muted-foreground mt-1">
            Overview of AI agents, actions, and human approval workflows.
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
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent actions */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-semibold">Recent AI Actions</h3>
            <p className="text-sm text-muted-foreground">Last 5 actions across all agents</p>
          </div>
          <Link
            href={`./ai/actions`}
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
            recentActions.data.map((action: any) => (
              <div key={action.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{action.action_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {action.agent?.name || 'Unknown agent'} · {action.entity_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Agent Registry', desc: 'View all registered AI agents', href: './ai/agents', icon: Bot },
          { label: 'Approval Queue', desc: 'Review pending AI actions', href: './ai/approvals', icon: Clock },
          { label: 'Action History', desc: 'Browse all AI action records', href: './ai/actions', icon: Activity },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="rounded-lg bg-primary/10 p-2.5">
              <item.icon className="h-5 w-5 text-primary" />
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
