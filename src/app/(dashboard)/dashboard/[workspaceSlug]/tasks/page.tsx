import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TasksTable } from '@/components/tasks/TasksTable';
import { getWorkspaceMembers } from '@/services/member.service';
import { getProjects } from '@/services/project.service';
import { getTasks } from '@/services/task.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export const metadata: Metadata = {
  title: 'Tasks | Coldingrod',
  description: 'Manage your workspace tasks',
};

export default async function TasksPage(props: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const requestedPage = typeof searchParams.page === 'string' ? Number.parseInt(searchParams.page, 10) : 1;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;
  const assigneeId = typeof searchParams.assigneeId === 'string' ? searchParams.assigneeId : undefined;
  const archived = searchParams.view === 'archived';

  const [tasksResult, projectsResult, membersResult] = await Promise.all([
    getTasks({
      workspaceId: context.workspace.id,
      page,
      search,
      assigneeId,
      userId: context.user.id,
      archived,
    }),
    getProjects({ workspaceId: context.workspace.id, limit: 1000 }),
    getWorkspaceMembers(context.workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="coldingrod-label mb-2">Team execution</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em]">Tasks</h1>
        <p className="mt-2 text-muted-foreground">
          Assign, prioritize, and complete workspace work.
        </p>
      </div>
      <TasksTable
        tasks={tasksResult.data}
        totalPages={tasksResult.totalPages}
        currentPage={tasksResult.page}
        workspaceId={context.workspace.id}
        workspaceSlug={params.workspaceSlug}
        projects={projectsResult.data}
        members={membersResult.map((member) => ({
          id: member.user_id,
          full_name: member.user.full_name || member.user.email,
        }))}
        archived={archived}
      />
    </div>
  );
}
