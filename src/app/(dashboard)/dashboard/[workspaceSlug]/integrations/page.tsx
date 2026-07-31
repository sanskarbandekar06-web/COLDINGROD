import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LockKeyhole,
} from 'lucide-react';
import { IntegrationToggleButton } from '@/components/integrations/IntegrationToggleButton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { getIntegrationCatalog } from '@/services/integration.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const catalog = await getIntegrationCatalog(context.workspace.id);
  const google = catalog.find((item) => item.provider === 'google');
  const otherProviders = catalog.filter((item) => item.provider !== 'google');
  const canManage = context.permissions.includes('manage_integrations');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Server-side provider connections with workspace permissions, health status, and auditable state changes."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Available now</p>
          <p className="mt-1 text-2xl font-bold">1</p>
          <p className="text-xs text-muted-foreground">Google Places search</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Credential storage</p>
          <p className="mt-1 text-2xl font-bold">Server only</p>
          <p className="text-xs text-muted-foreground">Never saved in Supabase</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Workspace status</p>
          <p className="mt-1 text-2xl font-bold">
            {google?.operational ? 'Ready' : 'Setup'}
          </p>
          <p className="text-xs text-muted-foreground">Permission controlled</p>
        </div>
      </div>

      {google && (
        <SectionCard
          title="Google Places"
          description="Live business search for the human-reviewed lead discovery workflow."
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={google.enabled ? 'default' : 'outline'}>
                  {google.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Badge
                  variant={google.environmentConfigured ? 'default' : 'outline'}
                >
                  {google.environmentConfigured
                    ? 'API key detected'
                    : 'API key required'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                The browser never receives the API key. Search results remain
                temporary, and only a selected Google Place ID may be attached
                to a reviewed discovery candidate.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-lg border p-3">
                  <LockKeyhole
                    className="mt-0.5 size-4 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium">Credential isolation</p>
                    <p className="text-xs text-muted-foreground">
                      GOOGLE_PLACES_API_KEY stays in the server environment.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-lg border p-3">
                  <CheckCircle2
                    className="mt-0.5 size-4 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium">Human-controlled import</p>
                    <p className="text-xs text-muted-foreground">
                      Provider results never create leads automatically.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/${workspaceSlug}/leads/discovery`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Open lead discovery
                </Link>
                <a
                  href="https://developers.google.com/maps/documentation/places/web-service/cloud-setup"
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  Google setup guide
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              {canManage ? (
                <IntegrationToggleButton
                  workspaceSlug={workspaceSlug}
                  enabled={google.enabled}
                />
              ) : (
                <Badge variant="outline">Read-only</Badge>
              )}
              {!google.environmentConfigured && (
                <p className="max-w-xs text-xs text-muted-foreground lg:text-right">
                  Add the server key after enabling Places API (New), billing,
                  and API restrictions in Google Cloud.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Provider adapter registry"
        description="The database and UI boundaries are ready without claiming an OAuth connection that has not been verified."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {otherProviders.map((item) => (
            <div key={item.provider} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <Blocks className="size-4" aria-hidden="true" />
                </div>
                <Badge variant="outline">Adapter boundary ready</Badge>
              </div>
              <p className="mt-3 font-medium">{item.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.description}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {item.capability}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
