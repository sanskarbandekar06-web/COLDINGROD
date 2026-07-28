import { getWorkspaceContext } from '@/services/workspace.service';
import { getLeadDetails } from '@/services/lead.service';
import { getLeadContacts } from '@/services/contact.service';
import { getLeadActivities } from '@/services/lead-activity.service';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { LeadStatusSelector } from '@/components/leads/LeadStatusSelector';
import { LeadActionsMenu } from '@/components/leads/LeadActionsMenu';
import { ContactsList } from '@/components/leads/ContactsList';
import { ActivityTimeline } from '@/components/leads/ActivityTimeline';

export default async function LeadDetailsPage(props: { 
  params: Promise<{ workspaceSlug: string, leadId: string }>;
}) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) {
    notFound();
  }

  const [lead, contacts, activities] = await Promise.all([
    getLeadDetails(context.workspace.id, params.leadId),
    getLeadContacts(params.leadId),
    getLeadActivities(context.workspace.id, params.leadId)
  ]);

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.location.href = `/dashboard/${params.workspaceSlug}/leads`}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{lead.company_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground capitalize">
              {lead.source || 'Unknown Source'}
            </span>
            <span className="text-muted-foreground text-sm">•</span>
            <span className="text-sm text-muted-foreground">
              Assigned to {lead.assigned_user?.full_name || 'Unassigned'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LeadStatusSelector 
            leadId={lead.id} 
            workspaceId={context.workspace.id} 
            currentStatus={lead.status} 
          />
          <LeadActionsMenu
            lead={lead}
            workspaceId={context.workspace.id}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <SectionCard title="Contacts" description="People associated with this lead.">
            <ContactsList contacts={contacts} leadId={lead.id} workspaceId={context.workspace.id} />
          </SectionCard>

          <SectionCard title="Activity Timeline" description="History of interactions, notes, and system events.">
            <ActivityTimeline activities={activities} leadId={lead.id} workspaceId={context.workspace.id} />
          </SectionCard>
        </div>
        
        <div className="space-y-6">
          <SectionCard title="Lead Score" description="AI analyzed lead quality.">
             <div className="flex flex-col items-center justify-center py-6">
                <div className="text-4xl font-bold">--</div>
                <div className="text-sm text-muted-foreground mt-2">Not scored yet</div>
             </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
