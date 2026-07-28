import { getWorkspaceContext } from '@/services/workspace.service';
import { notFound, redirect } from 'next/navigation';
import { CompanyProfileForm } from '@/components/workspace/CompanyProfileForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { createClient } from '@/lib/supabase/server';

export default async function CompanyProfilePage(props: { params: Promise<{ workspaceSlug: string }> }) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  
  if (!context) {
    notFound();
  }

  // If this is a personal workspace, they shouldn't be here.
  if (context.workspace.is_personal) {
    redirect(`/dashboard/${context.workspace.slug}/settings`);
  }

  const hasPermission = context.permissions.includes('manage_settings');

  // Fetch company data
  const supabase = await createClient();
  const { data: companyData } = await supabase
    .from('companies')
    .select('*')
    .eq('workspace_id', context.workspace.id)
    .single();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Company Profile" 
        description="Manage the legal entity and details of your business." 
      />
      <CompanyProfileForm workspace={context.workspace} companyData={companyData} hasPermission={hasPermission} />
    </div>
  );
}
