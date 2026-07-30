import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CopyCheck,
  Search,
  Upload,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { DiscoveryCandidateReview } from '@/components/leads/DiscoveryCandidateReview';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getLeadDiscoveryRun } from '@/services/lead-discovery.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function LeadDiscoveryRunPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; runId: string }>;
}) {
  const { workspaceSlug, runId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const run = await getLeadDiscoveryRun(context.workspace.id, runId);
  if (!run) notFound();

  const canImport =
    context.permissions.includes('manage_ai') &&
    context.permissions.includes('manage_leads');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={run.run_name}
        description={`Lead Discovery Agent completed ${format(new Date(run.finished_at ?? run.created_at), 'MMM d, yyyy, h:mm a')}.`}
        action={
          <Link
            href={`/dashboard/${workspaceSlug}/leads/discovery`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All discovery runs
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="capitalize">
          {run.status.replaceAll('_', ' ')}
        </Badge>
        <Badge variant="secondary" className="capitalize">
          {run.source_type.replaceAll('_', ' ')}
        </Badge>
        {run.ai_action_id && (
          <Link
            href={`/dashboard/${workspaceSlug}/ai/actions/${run.ai_action_id}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <Bot className="size-4" aria-hidden="true" />
            View discovery AI action
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Candidates"
          value={run.candidate_count}
          icon={Search}
          description="Observed businesses"
        />
        <StatCard
          title="Ready"
          value={run.ready_count}
          icon={CheckCircle2}
          description="Available to import"
        />
        <StatCard
          title="Duplicates"
          value={run.duplicate_count}
          icon={CopyCheck}
          description="Not recreated"
        />
        <StatCard
          title="Imported"
          value={run.imported_count}
          icon={Upload}
          description="Created as leads"
        />
      </div>

      {(run.market ||
        run.target_location ||
        run.service_focus ||
        run.notes) && (
        <Card>
          <CardHeader>
            <CardTitle>Search brief</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {run.market && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Market
                  </dt>
                  <dd className="mt-1">{run.market}</dd>
                </div>
              )}
              {run.target_location && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Location
                  </dt>
                  <dd className="mt-1">{run.target_location}</dd>
                </div>
              )}
              {run.service_focus && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Service opportunity
                  </dt>
                  <dd className="mt-1">{run.service_focus}</dd>
                </div>
              )}
              {run.notes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {run.notes}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <DiscoveryCandidateReview
        workspaceSlug={workspaceSlug}
        runId={run.id}
        candidates={run.candidates}
        canImport={canImport}
      />
    </div>
  );
}
