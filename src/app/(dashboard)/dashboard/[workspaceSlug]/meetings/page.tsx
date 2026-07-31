import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getWorkspaceContext } from '@/services/workspace.service';
import {
  getMemberAvailabilitySlots,
  getWorkspaceMeetings,
} from '@/services/meeting.service';
import { MeetingList } from '@/components/meetings/MeetingList';
import { MeetingForm } from '@/components/meetings/MeetingForm';
import { AvailabilityCalendar } from '@/components/meetings/AvailabilityCalendar';

export const metadata: Metadata = {
  title: 'Meetings | Coldingrod',
  description: 'Manage your meetings and availability',
};

interface MeetingsPageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MeetingsPage({
  params,
  searchParams,
}: MeetingsPageProps) {
  const { workspaceSlug } = await params;
  const search = await searchParams;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const canManageMeetings = context.permissions.includes('manage_meetings');
  const showArchived = canManageMeetings && search.archived === 'true';
  const now = new Date();
  const availabilityStart = new Date(now);
  availabilityStart.setDate(availabilityStart.getDate() - 7);
  const availabilityEnd = new Date(now);
  availabilityEnd.setDate(availabilityEnd.getDate() + 180);

  const [meetings, personalAvailability] = await Promise.all([
    getWorkspaceMeetings(context.workspace.id, showArchived),
    getMemberAvailabilitySlots(
      context.workspace.id,
      context.member.id,
      availabilityStart.toISOString(),
      availabilityEnd.toISOString()
    ),
  ]);

  const unscheduledMeetings = meetings.filter(
    (meeting) => meeting.status === 'requested' && !meeting.start_time
  );
  const upcomingMeetings = meetings.filter(
    (meeting) =>
      meeting.status !== 'cancelled' &&
      meeting.status !== 'completed' &&
      meeting.status !== 'no_show' &&
      meeting.start_time &&
      new Date(meeting.start_time) >= now
  );
  const pastMeetings = meetings.filter(
    (meeting) =>
      meeting.status === 'cancelled' ||
      meeting.status === 'completed' ||
      meeting.status === 'no_show' ||
      (meeting.start_time && new Date(meeting.start_time) < now)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="coldingrod-label mb-2">Calendar workspace</p>
          <h1 className="text-4xl font-bold tracking-[-0.045em] text-brand-navy sm:text-5xl">
            {showArchived ? 'Archived Meetings' : 'Meetings'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {showArchived
              ? 'Review and restore archived meeting records.'
              : 'Manage your schedule, personal availability, and upcoming client calls.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManageMeetings && (
            <Link
              href={`/dashboard/${workspaceSlug}/meetings${showArchived ? '' : '?archived=true'}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {showArchived ? 'View Active' : 'View Archived'}
            </Link>
          )}
          {!showArchived && canManageMeetings && (
            <MeetingForm
              workspaceId={context.workspace.id}
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>
      </div>

      {showArchived ? (
        <MeetingList meetings={meetings} workspaceSlug={workspaceSlug} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {unscheduledMeetings.length > 0 && (
              <section>
                <h2 className="mb-4 text-xl font-semibold text-yellow-600">
                  Action Required: Unscheduled Requests
                </h2>
                <MeetingList
                  meetings={unscheduledMeetings}
                  workspaceSlug={workspaceSlug}
                />
              </section>
            )}

            <section>
              <h2 className="mb-4 text-xl font-semibold">Upcoming Meetings</h2>
              <MeetingList meetings={upcomingMeetings} workspaceSlug={workspaceSlug} />
            </section>

            <section>
              <h2 className="mb-4 text-xl font-semibold text-muted-foreground">
                Past &amp; Cancelled
              </h2>
              <div className="opacity-70">
                <MeetingList meetings={pastMeetings} workspaceSlug={workspaceSlug} />
              </div>
            </section>
          </div>

          <div className="space-y-6 lg:col-span-1">
            <AvailabilityCalendar
              slots={personalAvailability}
              workspaceId={context.workspace.id}
              workspaceSlug={workspaceSlug}
              canEdit
            />
          </div>
        </div>
      )}
    </div>
  );
}
