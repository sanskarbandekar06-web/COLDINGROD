import { getWorkspaceContext } from '@/services/workspace.service';
import { getAgents } from '@/services/ai-agent.service';
import { notFound, redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { Bot, Search, ChevronLeft, ChevronRight, Activity, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Agents | Coldingrod',
  description: 'Registered AI agents in your workspace',
};

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) redirect('/dashboard');

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) || 1 : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;

  const agentsResult = await getAgents({
    workspaceId: context.workspace.id,
    page,
    search,
  });

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href={`/dashboard/${params.workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
            <span>/</span>
            <span>Agents</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Agent Registry</h2>
          <p className="text-muted-foreground mt-1">
            Registered AI agents — system-wide and workspace-specific.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {/* Header info */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span>{agentsResult.count} agent{agentsResult.count !== 1 ? 's' : ''} registered</span>
          </div>
        </div>

        {/* Agent list */}
        <div className="divide-y">
          {agentsResult.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No agents found</h3>
              <p className="text-sm text-muted-foreground">
                {search ? `No agents match "${search}".` : 'No AI agents are registered yet.'}
              </p>
            </div>
          ) : (
            agentsResult.data.map((agent) => (
              <Link
                key={agent.id}
                href={`/dashboard/${params.workspaceSlug}/ai/agents/${agent.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
                    {agent.workspace_id ? (
                      <Bot className="h-5 w-5 text-primary" />
                    ) : (
                      <Globe className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">
                        {agent.name}
                      </p>
                      {!agent.workspace_id && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 font-medium">
                          System
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {agent.description || 'No description available'}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Model: <span className="font-mono">{agent.model}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                      <Activity className="h-3 w-3" />
                      <span>{agent.recentActionCount || 0} action{(agent.recentActionCount || 0) !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Updated {format(new Date(agent.updated_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {agentsResult.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">
              Page {agentsResult.page} of {agentsResult.totalPages}
            </p>
            <div className="flex gap-2">
              {agentsResult.page > 1 && (
                <Link
                  href={`?page=${agentsResult.page - 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Link>
              )}
              {agentsResult.page < agentsResult.totalPages && (
                <Link
                  href={`?page=${agentsResult.page + 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Note about read-only registry */}
      <p className="text-xs text-muted-foreground">
        Agent records are managed by the system. Contact your administrator to add or modify agents.
      </p>
    </div>
  );
}
