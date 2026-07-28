import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, Clock, Video, User } from 'lucide-react';
import { Meeting } from '@/types/meeting';
import { MeetingStatusBadge } from './MeetingStatusBadge';
import { format } from 'date-fns';

interface MeetingListProps {
  meetings: Meeting[];
  workspaceSlug: string;
}

export function MeetingList({ meetings, workspaceSlug }: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-dashed text-center">
        <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-foreground">No meetings found</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          No meetings in this view.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {meetings.map((meeting) => (
        <Card key={meeting.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start gap-4 mb-2">
              <CardTitle className="text-xl line-clamp-1">{meeting.title}</CardTitle>
              <MeetingStatusBadge status={meeting.status} />
            </div>
            <CardDescription className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4" />
              {meeting.start_time ? format(new Date(meeting.start_time), 'MMM d, yyyy') : 'TBD'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {meeting.start_time && meeting.end_time 
                    ? `${format(new Date(meeting.start_time), 'h:mm a')} - ${format(new Date(meeting.end_time), 'h:mm a')}`
                    : 'To be scheduled'}
                </span>
              </div>
              {meeting.meet_link && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground line-clamp-1">
                  <Video className="h-4 w-4 shrink-0" />
                  <a href={meeting.meet_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    {meeting.meet_link}
                  </a>
                </div>
              )}
              {meeting.client_id && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" />
                  <span>Client Associated</span>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <Button
              variant="outline"
              className="w-full"
              render={<Link href={`/dashboard/${workspaceSlug}/meetings/${meeting.id}`} />}
            >
              View Details
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
