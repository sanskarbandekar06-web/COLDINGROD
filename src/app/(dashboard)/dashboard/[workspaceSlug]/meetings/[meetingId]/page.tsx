import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, Clock, User, Users, Video } from 'lucide-react';
import { getWorkspaceContext } from '@/services/workspace.service';
import { getMeetingById, getMeetingParticipants } from '@/services/meeting.service';
import { getWorkspaceMembers } from '@/services/member.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MeetingStatusBadge } from '@/components/meetings/MeetingStatusBadge';
import { MeetingStatusSelect } from '@/components/meetings/MeetingStatusSelect';
import { MeetingEditForm } from '@/components/meetings/MeetingEditForm';
import { ParticipantManager } from '@/components/meetings/ParticipantManager';
import { ArchiveRestoreButton } from '@/components/meetings/ArchiveRestoreButton';
import type { MeetingParticipantOption } from '@/types/meeting';

export const metadata: Metadata = {
  title: 'Meeting Details | Coldingrod',
  description: 'View and manage meeting details',
};

interface MeetingDetailsPageProps {
  params: Promise<{
    workspaceSlug: string;
    meetingId: string;
  }>;
}

export default async function MeetingDetailsPage({ params }: MeetingDetailsPageProps) {
  const { workspaceSlug, meetingId } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const { workspace } = context;
  const hasManagePermission = context.permissions.includes('manage_meetings');
  const meeting = await getMeetingById(workspace.id, meetingId, hasManagePermission);
  if (!meeting) notFound();

  const [participants, members] = await Promise.all([
    getMeetingParticipants(workspace.id, meeting.id),
    hasManagePermission ? getWorkspaceMembers(workspace.id) : Promise.resolve([]),
  ]);
  const participantOptions: MeetingParticipantOption[] = members.map((member) => ({
    id: member.id,
    label: member.user.full_name?.trim() || member.user.email,
  }));

  const isMutable =
    !meeting.deleted_at &&
    (meeting.status === 'requested' || meeting.status === 'scheduled');
  const canEdit = hasManagePermission && isMutable;
  const canChangeStatus =
    hasManagePermission &&
    !meeting.deleted_at &&
    meeting.status !== 'completed' &&
    meeting.status !== 'cancelled' &&
    meeting.status !== 'no_show';

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          render={
            <Link
              href={`/dashboard/${workspaceSlug}/meetings${meeting.deleted_at ? '?archived=true' : ''}`}
              aria-label="Back to meetings"
            />
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{meeting.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {meeting.deleted_at
                ? 'Review this archived meeting or restore it.'
                : 'Manage meeting details and participants.'}
            </p>
          </div>
          <div className="flex gap-2">
            <MeetingEditForm
              workspaceId={workspace.id}
              workspaceSlug={workspaceSlug}
              meeting={meeting}
              canEdit={canEdit}
            />
            {hasManagePermission && (
              <ArchiveRestoreButton
                meetingId={meeting.id}
                workspaceSlug={workspaceSlug}
                isArchived={Boolean(meeting.deleted_at)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Meeting Information</CardTitle>
                  <CardDescription>Key details about this meeting</CardDescription>
                </div>
                <MeetingStatusBadge status={meeting.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> Date
                  </div>
                  <div className="font-medium">
                    {meeting.start_time
                      ? format(new Date(meeting.start_time), 'EEEE, MMMM d, yyyy')
                      : 'To be determined'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" /> Time
                  </div>
                  <div className="font-medium">
                    {meeting.start_time && meeting.end_time
                      ? `${format(new Date(meeting.start_time), 'h:mm a')} - ${format(new Date(meeting.end_time), 'h:mm a')}`
                      : 'To be scheduled'}
                  </div>
                </div>
              </div>

              {meeting.description && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Description</div>
                  <div className="text-sm font-medium">{meeting.description}</div>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Video className="h-4 w-4" /> Meeting Link
                </div>
                <div className="font-medium">
                  {meeting.meet_link ? (
                    <a
                      href={meeting.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {meeting.meet_link}
                    </a>
                  ) : (
                    <span className="italic text-muted-foreground">No link provided</span>
                  )}
                </div>
              </div>

              {meeting.client_id && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" /> Associated Client
                  </div>
                  <Link
                    href={`/dashboard/${workspaceSlug}/clients/${meeting.client_id}`}
                    className="font-medium text-blue-500 hover:underline"
                  >
                    View Client
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canChangeStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>Advance this meeting&apos;s status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <MeetingStatusSelect
                    meetingId={meeting.id}
                    workspaceSlug={workspaceSlug}
                    currentStatus={meeting.status}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Participants ({participants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ParticipantManager
                meetingId={meeting.id}
                workspaceId={workspace.id}
                workspaceSlug={workspaceSlug}
                participants={participants}
                availableMembers={participantOptions}
                canEdit={canEdit}
                organizerId={meeting.organizer_id}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
