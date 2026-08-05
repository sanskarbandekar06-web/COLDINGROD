import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { getClients } from '@/services/client.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { getProjects } from '@/services/project.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import type { ProjectStatus } from '@/types/project';

export const metadata: Metadata = {
  title: 'Projects | Coldingrod',
  description: 'Manage your workspace projects',
};

export default async function ProjectsPage(props: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) notFound();

  const requestedPage = typeof searchParams.page === 'string' ? Number.parseInt(searchParams.page, 10) : 1;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;
  const status = typeof searchParams.status === 'string' ? (searchParams.status as ProjectStatus) : undefined;
  const archived = searchParams.view === 'archived';

  const [projectsResult, clientsResult, membersResult] = await Promise.all([
    getProjects({ workspaceId: context.workspace.id, page, search, status, archived }),
    getClients({ workspaceId: context.workspace.id, limit: 1000 }),
    getWorkspaceMembers(context.workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="coldingrod-label mb-2">Delivery workspace</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em]">Projects</h1>
        <p className="mt-2 text-muted-foreground">
          Track delivery, ownership, and project progress.
        </p>
      </div>
      <ProjectsTable
        projects={projectsResult.data}
        totalPages={projectsResult.totalPages}
        currentPage={projectsResult.page}
        workspaceId={context.workspace.id}
        workspaceSlug={params.workspaceSlug}
        clients={clientsResult.data}
        members={membersResult.map((member) => ({
          id: member.user_id,
          full_name: member.user.full_name || member.user.email,
        }))}
        archived={archived}
      />
    </div>
  );
}
