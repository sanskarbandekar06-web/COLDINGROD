import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { ProjectViewTabs } from '@/components/projects/ProjectViewTabs';
import { getClients } from '@/services/client.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { getProjectDetails } from '@/services/project.service';
import { getTasks } from '@/services/task.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export const metadata: Metadata = { title: 'Project Profile | Coldingrod', description: 'View project details and tasks' };

export default async function ProjectProfilePage(props: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();
  const assigneeId = typeof searchParams.assigneeId === 'string' ? searchParams.assigneeId : undefined;

  const [project, tasksResult, membersResult, clientsResult] = await Promise.all([
    getProjectDetails(context.workspace.id, params.projectId),
    getTasks({ workspaceId: context.workspace.id, projectId: params.projectId, limit: 1000, assigneeId, userId: context.user.id }),
    getWorkspaceMembers(context.workspace.id),
    getClients({ workspaceId: context.workspace.id, limit: 1000 }),
  ]);
  if (!project) notFound();

  const members = membersResult.map((member) => ({ id: member.user_id, full_name: member.user.full_name || member.user.email }));
  const supabase = await createClient();
  const taskIds = tasksResult.data.map((task) => task.id).join(',') || '00000000-0000-0000-0000-000000000000';
  const { data: activities } = await supabase
    .from('activities')
    .select('id, action, created_at, metadata, actor_user:users!actor_user_id(full_name)')
    .eq('workspace_id', context.workspace.id)
    .in('entity_type', ['project', 'task'])
    .or(`entity_id.eq.${params.projectId},and(entity_type.eq.task,entity_id.in.(${taskIds}))`)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} workspaceId={context.workspace.id} workspaceSlug={params.workspaceSlug} clients={clientsResult.data} members={members} />
      <div className="pt-2">
        <ProjectViewTabs workspaceId={context.workspace.id} workspaceSlug={params.workspaceSlug} project={project} tasks={tasksResult.data} activities={activities || []} projects={[{ id: project.id, name: project.name }]} members={members} />
      </div>
    </div>
  );
}
