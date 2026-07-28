import { getWorkspaceContext } from '@/services/workspace.service';
import { getTasks } from '@/services/task.service';
import { getProjects } from '@/services/project.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { TasksTable } from '@/components/tasks/TasksTable';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tasks | Coldingrod',
  description: 'Manage your workspace tasks'
};

export default async function TasksPage({
  params,
  searchParams
}: {
  params: { workspaceSlug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;
  const assigneeId = typeof searchParams.assigneeId === 'string' ? searchParams.assigneeId : undefined;
  
  const [tasksResult, projectsResult, membersResult] = await Promise.all([
    getTasks({
      workspaceId: context.workspace.id,
      page: isNaN(page) ? 1 : page,
      search,
      assigneeId,
      userId: context.user.id
    }),
    getProjects({ workspaceId: context.workspace.id, limit: 1000 }),
    getWorkspaceMembers(context.workspace.id)
  ]);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
      </div>
      <TasksTable 
        tasks={tasksResult.data}
        totalPages={tasksResult.totalPages}
        currentPage={tasksResult.page}
        workspaceId={context.workspace.id}
        projects={projectsResult.data}
        members={membersResult.map(m => ({ id: m.user_id, full_name: m.user.full_name || m.user.email }))}
        userId={context.user.id}
      />
    </div>
  );
}
