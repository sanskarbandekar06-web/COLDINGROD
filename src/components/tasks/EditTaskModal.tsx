'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { updateTaskAction } from '@/actions/tasks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Task } from '@/types/task';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>;
}

export function EditTaskModal({
  open,
  onClose,
  workspaceId,
  task,
  members,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  task: Task;
  members: { id: string; full_name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = async (formData: FormData) => {
    setError(null);
    const result = await updateTaskAction(workspaceId, task.id, null, formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success('Task updated');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update the task name, assignee, or due date.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4 pt-4">
          {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="edit-task-title">Task title</Label>
            <Input id="edit-task-title" name="title" defaultValue={task.title} maxLength={300} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-task-assignee">Assignee</Label>
            <select
              id="edit-task-assignee"
              name="assigned_to"
              defaultValue={task.assigned_to || 'unassigned'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="unassigned">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-task-due-date">Due date</Label>
            <Input id="edit-task-due-date" name="due_date" type="date" defaultValue={task.due_date?.slice(0, 10) || ''} />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <SubmitButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
