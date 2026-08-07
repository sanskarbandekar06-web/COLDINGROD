import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  MonitorSmartphone,
  Download,
  ExternalLink,
  KeyRound,
  MessageSquareText,
  MousePointerClick,
  ShieldCheck,
} from 'lucide-react';
import { BrowserExtensionSetup } from '@/components/integrations/BrowserExtensionSetup';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getBrowserExtensionConnections } from '@/services/browser-extension.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function BrowserExtensionSettingsPage({
  params,
  searchParams,
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const connections = await getBrowserExtensionConnections(context.user.id);
  const hasActiveConnection = connections.some(
    (connection) => connection.is_active,
  );
  const canManage = context.permissions.includes('manage_integrations');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Browser Companion"
        description="Research the active business page, manage lead context, draft outreach, approve it, and complete human-controlled delivery without losing your browsing context."
        action={
          hasActiveConnection ? undefined : (
            <a
              href="/downloads/coldingrod-browser-companion.zip"
              download
              className={buttonVariants()}
            >
              <Download className="size-4" aria-hidden="true" />
              Download extension
            </a>
          )
        }
      />

      {query?.welcome === '1' && (
        <Alert className="border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2
            className="size-4 text-emerald-600"
            aria-hidden="true"
          />
          <AlertTitle>Your company workspace is ready</AlertTitle>
          <AlertDescription>
            <p>
              {hasActiveConnection
                ? 'Your existing Browser Companion is already connected to your account and has switched to this workspace.'
                : 'Add the Browser Companion now to research and message leads beside the sites you visit. You can also skip this and return later from Integrations or Settings.'}
            </p>
            <Link
              href={`/dashboard/${workspaceSlug}`}
              className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3`}
            >
              Continue to dashboard
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <MousePointerClick
            className="size-5 text-brand-indigo"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">Page-aware lead context</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Matches the active business site to an existing workspace lead.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <MessageSquareText
            className="size-5 text-brand-indigo"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">Messaging side panel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft, review, copy, open the channel, and confirm delivery.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <ShieldCheck
            className="size-5 text-brand-indigo"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">Human approval enforced</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No extension-created message becomes deliverable before approval.
          </p>
        </div>
      </div>

      {!hasActiveConnection && (
        <SectionCard
          title="Install in Chrome or Edge"
        description="The current package installs locally while the Chrome Web Store listing is prepared."
      >
        <ol className="grid gap-4 md:grid-cols-2" aria-label="Installation steps">
          {[
            {
              title: 'Download and unzip',
              text: 'Download the ZIP above, then extract it to a folder you will keep.',
            },
            {
              title: 'Open Extensions',
              text: 'Open chrome://extensions or edge://extensions and enable Developer mode.',
            },
            {
              title: 'Load unpacked',
              text: 'Choose Load unpacked and select the extracted extension folder.',
            },
            {
              title: 'Pair and pin',
              text: 'Generate a key below, paste it in the side panel, connect, and pin the Coldingrod icon.',
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-lg border p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-indigo-soft text-xs font-bold text-brand-indigo">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">
            <MonitorSmartphone className="size-3.5" aria-hidden="true" />
            Chrome 114+
          </Badge>
          <Badge variant="outline">Microsoft Edge</Badge>
          <Link
            href={`/dashboard/${workspaceSlug}/integrations`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Back to integrations
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        </SectionCard>
      )}

      <SectionCard
        title="Account connection"
        description="Connect once, then use the same browser companion across every workspace you can access."
      >
        <BrowserExtensionSetup
          workspaceSlug={workspaceSlug}
          connections={connections}
          canManage={canManage}
        />
      </SectionCard>

      <SectionCard title="What delivery means">
        <div className="flex gap-3 text-sm text-muted-foreground">
          <KeyRound
            className="mt-0.5 size-4 shrink-0 text-brand-indigo"
            aria-hidden="true"
          />
          <p>
            Coldingrod opens the selected native channel with the approved
            content ready to use. You remain responsible for the final send
            click, then choose <strong>I sent it</strong> in the companion so
            CRM history, lead status, duplicate protection, and follow-up
            timing stay accurate.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
