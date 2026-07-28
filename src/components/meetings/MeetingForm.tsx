'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createMeetingAction } from '@/actions/meeting';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MeetingFormProps {
  workspaceId: string;
  workspaceSlug: string;
}

export function MeetingForm({ workspaceId, workspaceSlug }: MeetingFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await createMeetingAction(workspaceId, workspaceSlug, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Meeting created successfully');
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Request Meeting
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request / Schedule Meeting</DialogTitle>
          <DialogDescription>
            Create a new meeting. Time is optional if requesting scheduling.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Meeting Title *</Label>
            <Input id="title" name="title" placeholder="e.g., Discovery Call" required />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Brief agenda" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date (Optional)</Label>
            <Input id="date" name="date" type="date" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time (Optional)</Label>
              <Input id="startTime" name="startTime" type="time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time (Optional)</Label>
              <Input id="endTime" name="endTime" type="time" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetLink">Meeting Link (Optional)</Label>
            <Input id="meetLink" name="meetLink" type="url" placeholder="https://meet.google.com/..." />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
