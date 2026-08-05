import { notFound } from 'next/navigation';
import { AssetListMini } from '@/components/assets/AssetListMini';
import { ClientHeader } from '@/components/clients/ClientHeader';
import { ClientHealthCard } from '@/components/clients/ClientHealthCard';
import { ClientNotes } from '@/components/clients/ClientNotes';
import { ClientTimeline } from '@/components/clients/ClientTimeline';
import { MeetingListMini } from '@/components/meetings/MeetingListMini';
import { ProjectListMini } from '@/components/projects/ProjectListMini';
import { getEntityAssets } from '@/services/asset.service';
import { getClientActivities } from '@/services/client-activity.service';
import { getClientProjects } from '@/services/client-project.service';
import { getClientDetails } from '@/services/client.service';
import { getClientMeetings } from '@/services/meeting.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; clientId: string }>;
}) {
  const { workspaceSlug, clientId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  const workspace = context?.workspace;
  if (!workspace) notFound();

  const [client, activities, projects, meetings, assets] = await Promise.all([
    getClientDetails(workspace.id, clientId),
    getClientActivities(workspace.id, clientId),
    getClientProjects(workspace.id, clientId),
    getClientMeetings(workspace.id, clientId),
    getEntityAssets(workspace.id, 'client', clientId),
  ]);
  if (!client) notFound();

  const notes = activities.filter((activity) => activity.action === 'note');
  const timelineActivities = activities.filter(
    (activity) => activity.action !== 'note',
  );

  return (
    <div className="space-y-6">
      <ClientHeader client={client} workspaceId={workspace.id} workspaceSlug={workspaceSlug} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <ClientHealthCard
            projects={projects}
            meetings={meetings}
            activities={timelineActivities}
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ProjectListMini projects={projects} workspaceSlug={workspaceSlug} />
            <MeetingListMini meetings={meetings} workspaceSlug={workspaceSlug} />
          </div>

          <AssetListMini assets={assets} workspaceSlug={workspaceSlug} />

          <ClientNotes
            notes={notes}
            workspaceId={workspace.id}
            clientId={client.id}
            canManage={context.permissions.includes('manage_clients') || context.permissions.includes('admin')}
          />
        </div>

        <div className="space-y-6">
          <ClientTimeline activities={timelineActivities} />
        </div>
      </div>
    </div>
  );
}
