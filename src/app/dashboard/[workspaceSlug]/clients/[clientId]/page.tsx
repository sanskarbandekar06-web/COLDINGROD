import { getWorkspaceContext } from '@/services/workspace.service';
import { getClientDetails } from '@/services/client.service';
import { getClientActivities } from '@/services/client-activity.service';
import { getClientProjects } from '@/services/client-project.service';
import { getClientMeetings } from '@/services/meeting.service';
import { getEntityAssets } from '@/services/asset.service';
import { notFound } from 'next/navigation';
import { ClientHealthCard } from '@/components/clients/ClientHealthCard';
import { ClientTimeline } from '@/components/clients/ClientTimeline';
import { ClientNotes } from '@/components/clients/ClientNotes';
import { ProjectListMini } from '@/components/projects/ProjectListMini';
import { MeetingListMini } from '@/components/meetings/MeetingListMini';
import { AssetListMini } from '@/components/assets/AssetListMini';
import { ClientHeader } from '@/components/clients/ClientHeader';

export default async function ClientProfilePage({
  params,
}: {
  params: { workspaceSlug: string; clientId: string };
}) {
  const context = await getWorkspaceContext(params.workspaceSlug);
  const workspace = context?.workspace;
  
  if (!workspace) {
    notFound();
  }

  const [client, activities, projects, meetings, assets] = await Promise.all([
    getClientDetails(workspace.id, params.clientId),
    getClientActivities(workspace.id, params.clientId),
    getClientProjects(workspace.id, params.clientId),
    getClientMeetings(workspace.id, params.clientId),
    getEntityAssets(workspace.id, 'client', params.clientId),
  ]);

  if (!client) {
    notFound();
  }

  const notes = activities.filter(a => a.action === 'note');
  const timelineActivities = activities.filter(a => a.action !== 'note');

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <ClientHeader client={client} workspaceId={workspace.id} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <ClientHealthCard 
            projects={projects}
            meetings={meetings}
            activities={timelineActivities}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProjectListMini projects={projects} workspaceId={workspace.id} />
            <MeetingListMini meetings={meetings} workspaceId={workspace.id} />
          </div>

          <AssetListMini assets={assets} workspaceId={workspace.id} />
          
          <ClientNotes 
            notes={notes} 
            workspaceId={workspace.id} 
            clientId={client.id} 
          />
        </div>

        <div className="space-y-6">
          <ClientTimeline activities={timelineActivities} />
        </div>
      </div>
    </div>
  );
}
