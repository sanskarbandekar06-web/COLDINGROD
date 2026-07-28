import { getWorkspaceContext } from '@/services/workspace.service';
import { getProjects } from '@/services/project.service';
import { getClients } from '@/services/client.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ProjectStatus } from '@/types/project';

export const metadata: Metadata = {
  title: 'Projects | Coldingrod',
  description: 'Manage your workspace projects'
};

export default async function ProjectsPage({
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
  const status = typeof searchParams.status === 'string' ? (searchParams.status as ProjectStatus) : undefined;
  
  const [projectsResult, clientsResult, membersResult] = await Promise.all([
    getProjects({
      workspaceId: context.workspace.id,
      page: isNaN(page) ? 1 : page,
      search,
      status
    }),
    getClients({ workspaceId: context.workspace.id, limit: 1000 }),
    getWorkspaceMembers(context.workspace.id)
  ]);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
      </div>
      <ProjectsTable 
        projects={projectsResult.data}
        totalPages={projectsResult.totalPages}
        currentPage={projectsResult.page}
        workspaceId={context.workspace.id}
        clients={clientsResult.data}
        members={membersResult.map(m => ({ id: m.user_id, full_name: m.user.full_name || m.user.email }))}
      />
    </div>
  );
}
