import { getWorkspaceContext } from '@/services/workspace.service';
import { getOutreachMessages, getLeadsForOutreach } from '@/services/outreach.service';
import {
  OUTREACH_PLATFORMS,
  OUTREACH_STATUSES,
  type OutreachPlatform,
  type OutreachStatus,
} from '@/types/outreach';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { OutreachStatusBadge } from '@/components/outreach/OutreachStatusBadge';
import { ChannelBadge } from '@/components/outreach/ChannelBadge';
import { CreateMessageDialog } from '@/components/outreach/CreateMessageDialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Bot, Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import { OutreachMessageFilters } from '@/components/outreach/OutreachMessageFilters';

export default async function OutreachMessagesPage(props: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const { workspace } = context;

  // Parse and sanitize URL params server-side
  const page = Math.max(
    1,
    typeof searchParams.page === 'string' ? parseInt(searchParams.page) || 1 : 1
  );
  const search =
    typeof searchParams.search === 'string' && searchParams.search.length <= 200
      ? searchParams.search
      : undefined;
  const rawStatus = typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const status =
    rawStatus && (OUTREACH_STATUSES as string[]).includes(rawStatus)
      ? (rawStatus as OutreachStatus)
      : undefined;
  const rawPlatform = typeof searchParams.platform === 'string' ? searchParams.platform : undefined;
  const platform =
    rawPlatform && (OUTREACH_PLATFORMS as string[]).includes(rawPlatform)
      ? (rawPlatform as OutreachPlatform)
      : undefined;
  const leadId =
    typeof searchParams.lead === 'string' && searchParams.lead.length > 0
      ? searchParams.lead
      : undefined;
  const aiGenerated =
    searchParams.ai === 'true' ? true : searchParams.ai === 'false' ? false : undefined;
  const archived = searchParams.archived === 'true';

  const [messages, leads] = await Promise.all([
    getOutreachMessages({
      workspaceId: workspace.id,
      page,
      limit: 20,
      search,
      status,
      platform,
      leadId,
      aiGenerated,
      archived,
      sortBy: 'updated_at',
      sortOrder: 'desc',
    }),
    getLeadsForOutreach(workspace.id),
  ]);

  const canCreate = context.permissions.includes('manage_leads');
  const canGenerate = canCreate && context.permissions.includes('manage_ai');
  const basePath = `/dashboard/${params.workspaceSlug}/outreach/messages`;

  function buildPageUrl(p: number) {
    const sp = new URLSearchParams();
    if (p > 1) sp.set('page', String(p));
    if (search) sp.set('search', search);
    if (status) sp.set('status', status);
    if (platform) sp.set('platform', platform);
    if (leadId) sp.set('lead', leadId);
    if (aiGenerated !== undefined) sp.set('ai', String(aiGenerated));
    if (archived) sp.set('archived', 'true');
    return `${basePath}?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message Registry"
        description="All outreach messages across your workspace."
        action={
          canCreate ? (
            <CreateMessageDialog
              workspaceSlug={params.workspaceSlug}
              workspaceId={workspace.id}
              leads={leads}
              canGenerate={canGenerate}
            />
          ) : undefined
        }
      />

      <OutreachMessageFilters
        leads={leads}
        currentFilters={{ search, status, platform, leadId, aiGenerated, archived }}
        basePath={basePath}
      />

      {messages.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl">
          <Mail className="h-10 w-10 text-muted-foreground mb-4" aria-hidden="true" />
          <p className="text-sm font-medium">No messages found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search || status || platform || leadId || aiGenerated !== undefined || archived
              ? 'Try adjusting your filters.'
              : 'Create your first outreach message to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="hidden md:table-cell">Preview</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Source</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.data.map((msg) => {
                  const lead = msg.lead as { company_name?: string } | null;
                  const contact = msg.contact as {
                    first_name?: string;
                    last_name?: string | null;
                  } | null;
                  return (
                    <TableRow key={msg.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Link
                          href={`/dashboard/${params.workspaceSlug}/outreach/messages/${msg.id}`}
                          className="font-medium hover:underline text-sm"
                          aria-label={`View message for ${lead?.company_name ?? 'Unknown'}`}
                        >
                          {lead?.company_name ?? '—'}
                        </Link>
                        {contact && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {contact.first_name} {contact.last_name ?? ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChannelBadge platform={msg.platform as OutreachPlatform} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs">
                        <p className="text-xs text-muted-foreground truncate">
                          {msg.subject ? (
                            <span className="font-medium text-foreground">{msg.subject} · </span>
                          ) : null}
                          {msg.content.slice(0, 80)}{msg.content.length > 80 ? '…' : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <OutreachStatusBadge status={msg.status as OutreachStatus} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {msg.ai_action_id ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Bot className="h-3 w-3" aria-hidden="true" /> AI
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        <time dateTime={msg.updated_at}>
                          {formatDistanceToNow(new Date(msg.updated_at), { addSuffix: true })}
                        </time>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {messages.totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-xs text-muted-foreground">
                Page {messages.page} of {messages.totalPages} · {messages.count} messages
              </p>
              <div className="flex items-center gap-2">
                {messages.page > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={buildPageUrl(messages.page - 1)} aria-label="Previous page" />}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Prev
                  </Button>
                )}
                {messages.page < messages.totalPages && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={buildPageUrl(messages.page + 1)} aria-label="Next page" />}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
