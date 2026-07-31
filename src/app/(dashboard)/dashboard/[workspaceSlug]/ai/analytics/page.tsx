import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  MailCheck,
  MessageCircleReply,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { RunAnalyticsDialog } from '@/components/ai/RunAnalyticsDialog';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { MetricGrid } from '@/components/dashboard/MetricGrid';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { getAnalyticsSnapshots } from '@/services/analytics.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import type { AnalyticsRecommendation } from '@/types/analytics';

function priorityClasses(priority: AnalyticsRecommendation['priority']) {
  if (priority === 'high') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300';
  }
  if (priority === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300';
  }
  return 'border-border bg-muted text-muted-foreground';
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const snapshots = await getAnalyticsSnapshots(context.workspace.id, 10);
  const latest = snapshots[0] ?? null;
  const canRun =
    context.permissions.includes('manage_ai') &&
    context.permissions.includes('manage_leads');

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Analytics"
        description="Immutable funnel snapshots and deterministic optimization guidance."
        action={
          canRun ? <RunAnalyticsDialog workspaceSlug={workspaceSlug} /> : undefined
        }
      />

      {!canRun && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          This is a read-only view. AI and lead management permissions are
          required to create snapshots.
        </div>
      )}

      {!latest ? (
        <SectionCard
          title="No analytics snapshot yet"
          description="Run the agent to establish a time-bounded, auditable baseline."
        >
          <div className="flex flex-col items-center py-10 text-center">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <BarChart3 className="size-7" aria-hidden="true" />
            </div>
            <p className="mt-4 max-w-lg text-sm text-muted-foreground">
              Snapshots count only stored outcomes. Empty periods remain zero
              instead of being filled with estimates.
            </p>
          </div>
        </SectionCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <p className="text-sm font-medium">
                Latest {latest.period_days}-day snapshot
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(new Date(latest.period_start), 'MMM d, yyyy')} –{' '}
                {format(new Date(latest.period_end), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <Link
              href={`/dashboard/${workspaceSlug}/ai/actions/${latest.action_id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              View analytics action
            </Link>
          </div>

          <MetricGrid>
            <StatCard
              title="New Leads"
              value={latest.metrics.leads_created}
              icon={Target}
              description={`${latest.metrics.qualified_leads} qualified at 65+`}
            />
            <StatCard
              title="Average Opportunity"
              value={`${latest.metrics.average_opportunity_score}/100`}
              icon={Sparkles}
              description="Qualified scores in this period"
            />
            <StatCard
              title="Approval Rate"
              value={`${latest.metrics.approval_rate}%`}
              icon={CheckCircle2}
              description={`${latest.metrics.approved_messages} approved messages`}
            />
            <StatCard
              title="Delivery Rate"
              value={`${latest.metrics.delivery_rate}%`}
              icon={Send}
              description={`${latest.metrics.sent_messages} verified sends`}
            />
            <StatCard
              title="Response Rate"
              value={`${latest.metrics.response_rate}%`}
              icon={MessageCircleReply}
              description={`${latest.metrics.responses} recorded responses`}
            />
            <StatCard
              title="Meeting Rate"
              value={`${latest.metrics.meeting_rate}%`}
              icon={MailCheck}
              description={`${latest.metrics.meetings_scheduled} scheduled meetings`}
            />
            <StatCard
              title="Pending Reviews"
              value={latest.metrics.pending_approvals}
              icon={Clock3}
              description="Current approval queue"
            />
            <StatCard
              title="Active Follow-Ups"
              value={latest.metrics.active_follow_up_sequences}
              icon={Clock3}
              description="Active or paused sequences"
            />
          </MetricGrid>

          <SectionCard
            title="Lead-to-Client Funnel"
            description="Period counts are shown with their real denominators; stages are not estimated."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {latest.metrics.funnel.map((stage, index) => (
                <div
                  key={stage.key}
                  className="relative rounded-lg border bg-muted/20 p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {index + 1}. {stage.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold">{stage.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Optimization Recommendations"
            description="Transparent rules triggered by the latest stored metrics."
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {latest.recommendations.map((recommendation) => (
                <div key={recommendation.key} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{recommendation.title}</p>
                    <Badge
                      variant="outline"
                      className={priorityClasses(recommendation.priority)}
                    >
                      {recommendation.priority} priority
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {recommendation.detail}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}

      {snapshots.length > 0 && (
        <SectionCard
          title="Snapshot History"
          description="Immutable previous runs for comparison and audit."
        >
          <div className="divide-y">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {snapshot.period_days}-day snapshot
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created{' '}
                    {format(
                      new Date(snapshot.created_at),
                      'MMM d, yyyy h:mm a',
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {snapshot.metrics.responses} responses
                  </Badge>
                  <Badge variant="outline">
                    {snapshot.recommendations.length} recommendations
                  </Badge>
                  <Link
                    href={`/dashboard/${workspaceSlug}/ai/actions/${snapshot.action_id}`}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    View action
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
