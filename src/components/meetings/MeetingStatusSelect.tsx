'use client';

import React, { useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateMeetingStatusAction } from '@/actions/meeting';
import { MeetingStatus } from '@/types/meeting';
import { toast } from 'sonner';

interface MeetingStatusSelectProps {
  meetingId: string;
  workspaceSlug: string;
  currentStatus: MeetingStatus;
}

export function MeetingStatusSelect({ meetingId, workspaceSlug, currentStatus }: MeetingStatusSelectProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: MeetingStatus | null) => {
    if (!newStatus || newStatus === currentStatus) return;
    startTransition(async () => {
      const result = await updateMeetingStatusAction(meetingId, workspaceSlug, newStatus);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Meeting status updated to ${newStatus}`);
      }
    });
  };

  return (
    <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="requested">Requested</SelectItem>
        <SelectItem value="scheduled">Scheduled</SelectItem>
        <SelectItem value="in_progress">In Progress</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
        <SelectItem value="cancelled">Cancelled</SelectItem>
        <SelectItem value="no_show">No Show</SelectItem>
      </SelectContent>
    </Select>
  );
}
