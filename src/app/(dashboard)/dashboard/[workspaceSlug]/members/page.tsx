import { getWorkspaceContext } from '@/services/workspace.service';
import { getWorkspaceMembers, getAvailablePermissions } from '@/services/member.service';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { MembersTable } from '@/components/members/MembersTable';
import { InviteMemberModal } from '@/components/members/InviteMemberModal';

export default async function MembersPage(props: { params: Promise<{ workspaceSlug: string }> }) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  
  if (!context) {
    notFound();
  }
  if (context.workspace.is_personal) {
    redirect(`/dashboard/${params.workspaceSlug}/settings/profile`);
  }

  const hasPermission = context.permissions.includes('manage_members');

  const [members, availablePermissions] = await Promise.all([
    getWorkspaceMembers(context.workspace.id),
    getAvailablePermissions()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader 
          title="Team Members" 
          description="Manage who has access to this workspace and their permission levels." 
        />
        {hasPermission && (
          <InviteMemberModal 
            workspaceId={context.workspace.id} 
            availablePermissions={availablePermissions} 
          />
        )}
      </div>

      <MembersTable 
        members={members} 
        availablePermissions={availablePermissions} 
        canManage={hasPermission} 
        workspaceId={context.workspace.id}
        currentMemberId={context.member.id}
      />
    </div>
  );
}
