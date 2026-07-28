import { getClients } from '@/services/client.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import { notFound } from 'next/navigation';
import { ClientsTable } from '@/components/clients/ClientsTable';

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { page?: string; search?: string };
}) {
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
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
      </div>
      <ClientsTable 
        clients={clients} 
        totalPages={totalPages} 
        currentPage={page} 
        workspaceId={workspace.id} 
      />
    </div>
  );
}
