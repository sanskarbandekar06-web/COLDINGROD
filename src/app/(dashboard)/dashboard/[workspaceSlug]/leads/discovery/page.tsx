import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  CopyCheck,
  History,
  Search,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { LeadDiscoveryForm } from '@/components/leads/LeadDiscoveryForm';
import { GooglePlacesSearch } from '@/components/integrations/GooglePlacesSearch';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getRecentLeadDiscoveryRuns } from '@/services/lead-discovery.service';
import { getIntegrationCatalog } from '@/services/integration.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function LeadDiscoveryPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const [recentRuns, integrations] = await Promise.all([
    getRecentLeadDiscoveryRuns(context.workspace.id),
    getIntegrationCatalog(context.workspace.id),
  ]);
  const google = integrations.find(
    (integration) => integration.provider === 'google',
  );
  const canRun =
    context.permissions.includes('manage_ai') &&
    context.permissions.includes('manage_leads');
  const totalCandidates = recentRuns.reduce(
    (total, run) => total + run.candidate_count,
    0,
  );
  const totalImported = recentRuns.reduce(
    (total, run) => total + run.imported_count,
    0,
  );
  const totalDuplicates = recentRuns.reduce(
    (total, run) => total + run.duplicate_count,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Lead Discovery"
        description="Validate observed businesses, remove duplicates, and import only the candidates you approve."
        action={
          <Link
            href={`/dashboard/${workspaceSlug}/leads`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to leads
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Recent runs"
          value={recentRuns.length}
          icon={History}
          description="Latest 8 runs"
        />
        <StatCard
          title="Candidates checked"
          value={totalCandidates}
          icon={Search}
          description="Across recent runs"
        />
        <StatCard
          title="Duplicates caught"
          value={totalDuplicates}
          icon={CopyCheck}
          description="Before lead creation"
        />
        <StatCard
          title="Leads imported"
          value={totalImported}
          icon={CheckCircle2}
          description="Human approved"
        />
      </div>

      {!canRun && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          You can review previous discovery runs, but starting a new run requires
          both AI and lead management permission.
        </div>
      )}

      {canRun && google && (
        <GooglePlacesSearch
          workspaceSlug={workspaceSlug}
          enabled={google.enabled}
          configured={google.environmentConfigured}
        />
      )}

      {canRun && <LeadDiscoveryForm workspaceSlug={workspaceSlug} />}

      <section className="space-y-4" aria-labelledby="recent-discovery-runs">
        <div>
          <h2 id="recent-discovery-runs" className="text-lg font-semibold">
            Recent discovery runs
          </h2>
          <p className="text-sm text-muted-foreground">
            Reopen a run to review duplicate evidence or finish importing.
          </p>
        </div>

        {recentRuns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Search className="size-6" aria-hidden="true" />
              </div>
              <p className="mt-3 font-medium">No discovery runs yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Add your first observed businesses above. No lead is created
                until you review and select it.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {recentRuns.map((run) => (
              <Card key={run.id}>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{run.run_name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(run.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {run.status.replaceAll('_', ' ')}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold">{run.ready_count}</p>
                      <p className="text-xs text-muted-foreground">Ready</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold">
                        {run.duplicate_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Duplicate</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg font-semibold">
                        {run.imported_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Imported</p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/${workspaceSlug}/leads/discovery/${run.id}`}
                    className={buttonVariants({
                      variant: 'outline',
                      className: 'w-full',
                    })}
                  >
                    Review candidates
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
