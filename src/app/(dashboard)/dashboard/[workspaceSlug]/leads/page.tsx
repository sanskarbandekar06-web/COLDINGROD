import { getWorkspaceContext } from '@/services/workspace.service';
import { getLeads, getLeadStats } from '@/services/lead.service';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { LeadKPIs } from '@/components/leads/LeadKPIs';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsKanban } from '@/components/leads/LeadsKanban';
import { LeadStatus } from '@/types/lead';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function LeadsPage(props: { 
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) {
    notFound();
  }

  // Parse filters
  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined;
  const status = typeof searchParams.status === 'string' ? searchParams.status as LeadStatus : undefined;
  
  // Parallel fetch
  const [stats, leadsData, allLeadsForKanban] = await Promise.all([
    getLeadStats(context.workspace.id),
    getLeads({
      workspaceId: context.workspace.id,
      page,
      limit: 20,
      search,
      status
    }),
    getLeads({
      workspaceId: context.workspace.id,
      limit: 100, // Fetch more for kanban board
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Leads" 
        description="Manage your pipeline and track potential clients." 
      />
      
      <LeadKPIs stats={stats} />

      <Tabs defaultValue="list" className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="list" className="mt-0">
          <LeadsTable 
            leads={leadsData.data} 
            totalPages={leadsData.totalPages} 
            currentPage={leadsData.page} 
            workspaceId={context.workspace.id}
            workspaceSlug={params.workspaceSlug}
          />
        </TabsContent>
        
        <TabsContent value="kanban" className="mt-0">
          <LeadsKanban 
            initialLeads={allLeadsForKanban.data} 
            workspaceId={context.workspace.id} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
