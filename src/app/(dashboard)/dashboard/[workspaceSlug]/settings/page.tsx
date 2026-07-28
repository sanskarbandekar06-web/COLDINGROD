import { getWorkspaceContext } from '@/services/workspace.service';
import { notFound } from 'next/navigation';
import { WorkspaceSettingsForm } from '@/components/workspace/WorkspaceSettingsForm';
import { PageHeader } from '@/components/dashboard/PageHeader';

export default async function SettingsPage(props: { params: Promise<{ workspaceSlug: string }> }) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  
  if (!context) {
    notFound();
  }

  const hasPermission = context.permissions.includes('manage_settings');

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Workspace Settings" 
        description="Manage your workspace identity and preferences." 
      />
      <WorkspaceSettingsForm workspace={context.workspace} hasPermission={hasPermission} />
    </div>
  );
}
