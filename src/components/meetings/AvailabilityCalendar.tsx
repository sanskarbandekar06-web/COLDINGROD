'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import type { AvailabilitySlot } from '@/types/meeting';
import { Calendar, Trash2, Pencil, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { createAvailabilitySlotAction, updateAvailabilitySlotAction, deleteAvailabilitySlotAction } from '@/actions/meeting';
import { toast } from 'sonner';

interface AvailabilityCalendarProps {
  slots: AvailabilitySlot[];
  workspaceId: string;
  workspaceSlug: string;
  canEdit: boolean;
}

export function AvailabilityCalendar({ slots, workspaceId, workspaceSlug, canEdit }: AvailabilityCalendarProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (slotId: string) => {
    if (!confirm('Are you sure you want to delete this availability slot?')) return;
    
    startTransition(async () => {
      const result = await deleteAvailabilitySlotAction(slotId, workspaceSlug);
      if (result.error) toast.error(result.error);
      else toast.success('Slot deleted');
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Your Availability
          </CardTitle>
          <CardDescription>
            Manage available time slots.
          </CardDescription>
        </div>
        {canEdit && (
          <SlotFormDialog workspaceId={workspaceId} workspaceSlug={workspaceSlug} mode="create" />
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {slots.length === 0 ? (
          <div className="text-center p-8 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">No availability slots configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => (
              <div key={slot.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex flex-col">
                  <span className="font-medium text-sm">
                    {format(new Date(slot.start_time), 'EEEE, MMMM d, yyyy')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(slot.start_time), 'h:mm a')} - {format(new Date(slot.end_time), 'h:mm a')}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <SlotFormDialog workspaceId={workspaceId} workspaceSlug={workspaceSlug} mode="edit" slot={slot} />
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(slot.id)} disabled={isPending} className="text-red-500 hover:text-red-700 h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SlotFormDialog({ workspaceId, workspaceSlug, mode, slot }: { workspaceId: string, workspaceSlug: string, mode: 'create' | 'edit', slot?: AvailabilitySlot }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const startTimeStr = formData.get('startTime') as string;
    const endTimeStr = formData.get('endTime') as string;

    if (!date || !startTimeStr || !endTimeStr) {
      toast.error('Please fill out all fields');
      return;
    }

    const start_time = new Date(`${date}T${startTimeStr}`).toISOString();
    const end_time = new Date(`${date}T${endTimeStr}`).toISOString();

    if (new Date(start_time) >= new Date(end_time)) {
      toast.error('End time must be after start time');
      return;
    }

    startTransition(async () => {
      let result;
      if (mode === 'create') {
        result = await createAvailabilitySlotAction(workspaceId, workspaceSlug, start_time, end_time);
      } else {
        if (!slot) {
          toast.error('Availability slot not found');
          return;
        }
        result = await updateAvailabilitySlotAction(slot.id, workspaceId, workspaceSlug, start_time, end_time);
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Slot ${mode === 'create' ? 'created' : 'updated'}`);
        setOpen(false);
      }
    });
  };

  const formattedDate = slot ? new Date(slot.start_time).toISOString().split('T')[0] : '';
  const formattedStartTime = slot ? new Date(slot.start_time).toISOString().substring(11, 16) : '';
  const formattedEndTime = slot ? new Date(slot.end_time).toISOString().substring(11, 16) : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          mode === 'create'
            ? <Button size="sm" variant="outline" className="h-8" />
            : <Button variant="ghost" size="icon" className="h-8 w-8" />
        }
      >
        {mode === 'create' ? (
          <>
            <Plus className="h-4 w-4 mr-1" /> Add
          </>
        ) : (
          <Pencil className="h-4 w-4" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Availability Slot' : 'Edit Slot'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" required defaultValue={formattedDate} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input id="startTime" name="startTime" type="time" required defaultValue={formattedStartTime} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input id="endTime" name="endTime" type="time" required defaultValue={formattedEndTime} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
