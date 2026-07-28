import { getWorkspaceContext } from '@/services/workspace.service';
import { getOutreachStats, getOutreachMessages, getLeadsForOutreach } from '@/services/outreach.service';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { MetricGrid } from '@/components/dashboard/MetricGrid';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { OutreachStatusBadge } from '@/components/outreach/OutreachStatusBadge';
import { ChannelBadge } from '@/components/outreach/ChannelBadge';
import { CreateMessageDialog } from '@/components/outreach/CreateMessageDialog';
import {
  Mail,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Bot,
  RefreshCcw,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { OutreachPlatform, OutreachStatus } from '@/types/outreach';

export default async function OutreachPage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const { workspace } = context;

  const [stats, recentMessages, leads] = await Promise.all([
    getOutreachStats(workspace.id),
    getOutreachMessages({ workspaceId: workspace.id, limit: 5, sortBy: 'updated_at', sortOrder: 'desc' }),
    getLeadsForOutreach(workspace.id),
  ]);

  const canCreate = context.permissions.includes('manage_leads');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outreach"
        description="Prepare and manage outreach messages for your leads."
        action={
          canCreate ? (
            <CreateMessageDialog
              workspaceSlug={params.workspaceSlug}
              workspaceId={workspace.id}
              leads={leads}
            />
          ) : undefined
        }
      />

      {/* Metrics */}
      <MetricGrid>
        <StatCard title="Total Messages" value={stats.total} icon={Mail} description="Calculated" />
        <StatCard title="Drafts" value={stats.drafts} icon={MessageSquare} description="Calculated" />
        <StatCard title="Pending Approval" value={stats.pendingApproval} icon={Clock} description="Calculated" />
        <StatCard title="Approved / Scheduled" value={stats.approved} icon={CheckCircle} description="Calculated — messages in 'scheduled' status" />
        <StatCard title="Sent / Delivered" value={stats.sent} icon={Send} description="Calculated" />
        <StatCard title="AI Generated" value={stats.aiGenerated} icon={Bot} description="Calculated" />
        <StatCard title="Failed" value={stats.rejected} icon={XCircle} description="Calculated — messages in 'failed' status" />
        <StatCard title="Updated (7 days)" value={stats.recentlyUpdated} icon={RefreshCcw} description="Calculated — last 7 days" />
      </MetricGrid>

      {/* Recent messages */}
      <SectionCard
        title="Recent Messages"
        description="Last 5 updated outreach messages"
        action={
          <Link
            href={`/dashboard/${params.workspaceSlug}/outreach/messages`}
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        }
      >
        {recentMessages.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mail className="h-8 w-8 text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-sm font-medium">No outreach messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first message draft to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentMessages.data.map((msg) => {
              const lead = msg.lead as { company_name?: string } | null;
              return (
                <Link
                  key={msg.id}
                  href={`/dashboard/${params.workspaceSlug}/outreach/messages/${msg.id}`}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors group"
                  aria-label={`Message for ${lead?.company_name ?? 'Unknown lead'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium truncate">
                        {lead?.company_name ?? 'Unknown lead'}
                      </span>
                      <ChannelBadge platform={msg.platform as OutreachPlatform} />
                      <OutreachStatusBadge status={msg.status as OutreachStatus} />
                      {msg.ai_action_id && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bot className="h-3 w-3" aria-hidden="true" /> AI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {msg.content.slice(0, 120)}{msg.content.length > 120 ? '…' : ''}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(msg.updated_at), { addSuffix: true })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Phase boundary notice */}
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium mb-1">Delivery not performed in Phase 2.7</p>
        <p>
          This module prepares and approves outreach content. External delivery (email sending,
          WhatsApp, LinkedIn, etc.) requires a future integration phase.
          Messages will not be marked as sent without a real delivery mechanism.
        </p>
      </div>
    </div>
  );
}
