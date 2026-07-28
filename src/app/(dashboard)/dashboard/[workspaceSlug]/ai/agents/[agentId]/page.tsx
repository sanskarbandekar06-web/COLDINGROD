import { getWorkspaceContext } from '@/services/workspace.service';
import { getAgentDetails } from '@/services/ai-agent.service';
import { getAiActions } from '@/services/ai-action.service';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { format } from 'date-fns';
import { Bot, Globe, Activity, Clock, ChevronRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Agent Details | Coldingrod',
  description: 'AI agent details and recent actions',
};

export default async function AgentDetailPage({
  params,
}: {
  params: { workspaceSlug: string; agentId: string };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) redirect('/dashboard');

  const [agent, actionsResult] = await Promise.all([
    getAgentDetails(context.workspace.id, params.agentId),
    getAiActions({
      workspaceId: context.workspace.id,
      agentId: params.agentId,
      limit: 10,
    }),
  ]);

  if (!agent) notFound();

  const isSystemAgent = !agent.workspace_id;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/${params.workspaceSlug}/ai`} className="hover:underline">AI Center</Link>
        <span>/</span>
        <Link href={`/dashboard/${params.workspaceSlug}/ai/agents`} className="hover:underline">Agents</Link>
        <span>/</span>
        <span className="text-foreground">{agent.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`rounded-xl p-3 flex-shrink-0 ${isSystemAgent ? 'bg-blue-100 dark:bg-blue-950/40' : 'bg-primary/10'}`}>
          {isSystemAgent ? (
            <Globe className="h-8 w-8 text-blue-500" />
          ) : (
            <Bot className="h-8 w-8 text-primary" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
            {isSystemAgent && (
              <span className="text-sm px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 font-medium">
                System Agent
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{agent.description || 'No description provided.'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent info */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Configuration</h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Model</p>
                <p className="text-sm font-mono font-medium mt-0.5">{agent.model}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scope</p>
                <p className="text-sm font-medium mt-0.5">{isSystemAgent ? 'System-wide' : 'Workspace-specific'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">System Prompt</p>
                <p className="text-sm text-muted-foreground italic mt-0.5">[Redacted for security]</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium mt-0.5">{format(new Date(agent.created_at), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm font-medium mt-0.5">{format(new Date(agent.updated_at), 'MMM d, yyyy')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Action Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total actions</span>
                <span className="font-medium">{actionsResult.count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent actions */}
        <div className="rounded-lg border bg-card lg:col-span-2">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Recent Actions</h3>
            <Link
              href={`/dashboard/${params.workspaceSlug}/ai/actions?agentId=${agent.id}`}
              className="text-sm text-primary hover:underline"
            >
              View all →
            </Link>
          </div>

          <div className="divide-y">
            {actionsResult.data.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No actions recorded for this agent.
              </div>
            ) : (
              actionsResult.data.map((action: any) => (
                <Link
                  key={action.id}
                  href={`/dashboard/${params.workspaceSlug}/ai/actions/${action.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{action.action_type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">{action.entity_type} · {format(new Date(action.created_at), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      action.status === 'pending_approval' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                      action.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      action.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                      action.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      action.status === 'failed' ? 'bg-orange-100 text-orange-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {action.status.replace(/_/g, ' ')}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
