'use client';

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { updateMeetingAction } from '@/actions/meeting';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Meeting } from '@/types/meeting';

interface MeetingEditFormProps {
  workspaceId: string;
  workspaceSlug: string;
  meeting: Meeting;
  canEdit: boolean;
}

export function MeetingEditForm({ workspaceId, workspaceSlug, meeting, canEdit }: MeetingEditFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await updateMeetingAction(meeting.id, workspaceId, workspaceSlug, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Meeting updated successfully');
        setOpen(false);
      }
    });
  };

  const formattedDate = meeting.start_time ? new Date(meeting.start_time).toISOString().split('T')[0] : '';
  const formattedStartTime = meeting.start_time ? new Date(meeting.start_time).toISOString().substring(11, 16) : '';
  const formattedEndTime = meeting.end_time ? new Date(meeting.end_time).toISOString().substring(11, 16) : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <Pencil className="h-4 w-4" /> Edit Details
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Meeting</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Meeting Title *</Label>
            <Input id="title" name="title" defaultValue={meeting.title} required />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" defaultValue={meeting.description || ''} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date (Optional)</Label>
            <Input id="date" name="date" type="date" defaultValue={formattedDate} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time (Optional)</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue={formattedStartTime} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time (Optional)</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue={formattedEndTime} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetLink">Meeting Link (Optional)</Label>
            <Input id="meetLink" name="meetLink" type="url" defaultValue={meeting.meet_link || ''} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID (Optional)</Label>
            <Input id="clientId" name="clientId" defaultValue={meeting.client_id || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leadId">Lead ID (Optional)</Label>
            <Input id="leadId" name="leadId" defaultValue={meeting.lead_id || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectId">Project ID (Optional)</Label>
            <Input id="projectId" name="projectId" defaultValue={meeting.project_id || ''} />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
