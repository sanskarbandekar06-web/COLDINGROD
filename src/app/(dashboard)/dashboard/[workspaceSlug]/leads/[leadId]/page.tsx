import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, ExternalLink, Globe2, Mail, MapPin, Phone } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { ActivityTimeline } from '@/components/leads/ActivityTimeline';
import { ContactsList } from '@/components/leads/ContactsList';
import { LeadActionsMenu } from '@/components/leads/LeadActionsMenu';
import { LeadQualificationPanel } from '@/components/leads/LeadQualificationPanel';
import { LeadResearchPanel } from '@/components/leads/LeadResearchPanel';
import { LeadStatusSelector } from '@/components/leads/LeadStatusSelector';
import { getLeadActivities } from '@/services/lead-activity.service';
import { getLeadQualificationHistory } from '@/services/lead-qualification.service';
import { getLeadResearchHistory } from '@/services/lead-research.service';
import { getLeadDetails } from '@/services/lead.service';
import { getLeadContacts } from '@/services/contact.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function LeadDetailsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
}) {
  const { workspaceSlug, leadId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const [lead, contacts, activities, qualifications, researchReports] = await Promise.all([
    getLeadDetails(context.workspace.id, leadId),
    getLeadContacts(leadId),
    getLeadActivities(context.workspace.id, leadId),
    getLeadQualificationHistory(context.workspace.id, leadId),
    getLeadResearchHistory(context.workspace.id, leadId),
  ]);

  if (!lead) notFound();

  const canRunQualification =
    context.permissions.includes('manage_ai') &&
    context.permissions.includes('manage_leads');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href={`/dashboard/${workspaceSlug}/leads`}
          aria-label="Back to leads"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {lead.company_name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="capitalize">{lead.source || 'Unknown source'}</span>
            <span aria-hidden="true">•</span>
            <span>Assigned to {lead.assigned_user?.full_name || 'Unassigned'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <LeadStatusSelector
            leadId={lead.id}
            workspaceId={context.workspace.id}
            currentStatus={lead.status}
          />
          <LeadActionsMenu
            lead={lead}
            workspaceId={context.workspace.id}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {(lead.website_url ||
            lead.industry ||
            lead.location ||
            lead.business_email ||
            lead.business_phone) && (
            <SectionCard
              title="Business Profile"
              description="Business details preserved from lead discovery or manual research."
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                {lead.website_url && (
                  <div className="flex gap-3">
                    <Globe2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Website</dt>
                      <dd>
                        <a
                          href={lead.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 break-all text-primary hover:underline"
                        >
                          {lead.website_url}
                          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                {lead.industry && (
                  <div className="flex gap-3">
                    <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Industry</dt>
                      <dd>{lead.industry}</dd>
                    </div>
                  </div>
                )}
                {lead.location && (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</dt>
                      <dd>{lead.location}</dd>
                    </div>
                  </div>
                )}
                {lead.business_email && (
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business email</dt>
                      <dd className="break-all">{lead.business_email}</dd>
                    </div>
                  </div>
                )}
                {lead.business_phone && (
                  <div className="flex gap-3">
                    <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business phone</dt>
                      <dd>{lead.business_phone}</dd>
                    </div>
                  </div>
                )}
              </dl>
            </SectionCard>
          )}

          <SectionCard title="Contacts" description="People associated with this lead.">
            <ContactsList
              contacts={contacts}
              leadId={lead.id}
              workspaceId={context.workspace.id}
            />
          </SectionCard>

          <SectionCard
            title="Activity Timeline"
            description="History of interactions, notes, and system events."
          >
            <ActivityTimeline
              activities={activities}
              leadId={lead.id}
              workspaceId={context.workspace.id}
            />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="AI Opportunity Score"
            description="Transparent qualification based on observed business signals."
          >
            <LeadQualificationPanel
              workspaceSlug={workspaceSlug}
              leadId={lead.id}
              canRun={canRunQualification}
              latest={qualifications[0] ?? null}
            />
          </SectionCard>

          <SectionCard
            title="Research & Pain Points"
            description="Evidence-backed business context and service opportunities."
          >
            <LeadResearchPanel
              workspaceSlug={workspaceSlug}
              leadId={lead.id}
              canRun={canRunQualification}
              isQualified={qualifications.length > 0}
              latest={researchReports[0] ?? null}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
