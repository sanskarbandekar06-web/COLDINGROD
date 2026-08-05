import { notFound } from 'next/navigation';
import { getAppUrl } from '@/lib/app-url';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { InviteMemberModal } from '@/components/members/InviteMemberModal';
import { InvitationsTable } from '@/components/members/InvitationsTable';
import { getWorkspaceInvitations } from '@/services/invitation.service';
import { getAvailablePermissions } from '@/services/member.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function InvitationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context || !context.permissions.includes('manage_members')) notFound();

  const [invitations, permissions] = await Promise.all([
    getWorkspaceInvitations(context.workspace.id),
    getAvailablePermissions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          title="Workspace Invitations"
          description="Create, share, track, and revoke secure invitation links."
        />
        <InviteMemberModal
          workspaceId={context.workspace.id}
          availablePermissions={permissions}
        />
      </div>
      <InvitationsTable
        invitations={invitations}
        workspaceId={context.workspace.id}
        appUrl={getAppUrl()}
      />
    </div>
  );
}
