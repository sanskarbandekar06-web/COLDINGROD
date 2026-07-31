import { getClients } from '@/services/client.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import { notFound } from 'next/navigation';
import { ClientsTable } from '@/components/clients/ClientsTable';

export default async function ClientsPage(props: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const context = await getWorkspaceContext(params.workspaceSlug);
  const workspace = context?.workspace;

  if (!workspace) {
    notFound();
  }

  const page = searchParams.page ? parseInt(searchParams.page, 10) : 1;
  const search = searchParams.search || '';

  const { data: clients, totalPages } = await getClients({
    workspaceId: workspace.id,
    page,
    limit: 20,
    search,
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="coldingrod-label mb-2">Client workspace</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em]">Clients</h1>
        <p className="mt-2 text-muted-foreground">
          Manage client relationships and connected delivery work.
        </p>
      </div>
      <ClientsTable
        clients={clients}
        totalPages={totalPages}
        currentPage={page}
        workspaceId={workspace.id}
        workspaceSlug={params.workspaceSlug}
      />
    </div>
  );
}
