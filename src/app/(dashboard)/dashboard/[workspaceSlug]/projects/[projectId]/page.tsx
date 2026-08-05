import { getWorkspaceContext } from '@/services/workspace.service';
import { getProjectDetails } from '@/services/project.service';
import { getTasks } from '@/services/task.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { ProjectViewTabs } from '@/components/projects/ProjectViewTabs';

export const metadata: Metadata = {
  title: 'Project Profile | Coldingrod',
  description: 'View project details and tasks'
};

export default async function ProjectProfilePage(props: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const assigneeId = typeof searchParams.assigneeId === 'string' ? searchParams.assigneeId : undefined;

  const [project, tasksResult, members] = await Promise.all([
    getProjectDetails(context.workspace.id, params.projectId),
    getTasks({
      workspaceId: context.workspace.id,
      projectId: params.projectId,
      limit: 1000,
      assigneeId,
      userId: context.user.id
    }),
    getWorkspaceMembers(context.workspace.id)
  ]);

  if (!project) notFound();

  // Fetch activities directly for the timeline
  const supabase = await createClient();
  const { data: activities } = await supabase
    .from('activities')
    .select('id, action, created_at, metadata, actor_user:users!actor_user_id(full_name)')
    .eq('workspace_id', context.workspace.id)
    .in('entity_type', ['project', 'task'])
    .or(`entity_id.eq.${params.projectId},and(entity_type.eq.task,entity_id.in.(${tasksResult.data.map(t => t.id).join(',') || '00000000-0000-0000-0000-000000000000'}))`)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} workspaceId={context.workspace.id} workspaceSlug={params.workspaceSlug} />
      
      <div className="pt-2">
        <ProjectViewTabs 
          workspaceId={context.workspace.id}
          workspaceSlug={params.workspaceSlug}
          project={project}
          tasks={tasksResult.data}
          activities={activities || []}
          projects={[{ id: project.id, name: project.name }]}
          members={members.map(m => ({ id: m.user_id, full_name: m.user.full_name || m.user.email }))}
          userId={context.user.id}
        />
      </div>
    </div>
  );
}
