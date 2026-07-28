'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createTaskAction } from '@/actions/tasks';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projects: { id: string, name: string }[];
  members: { id: string, full_name: string }[];
  defaultProjectId?: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Task'}
    </Button>
  );
}

export function CreateTaskModal({ isOpen, onClose, workspaceId, projects, members, defaultProjectId }: CreateTaskModalProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const projectId = formData.get('project_id') as string;
    
    if (!projectId) {
      setError('Project is required');
      return;
    }
    
    const result = await createTaskAction(workspaceId, projectId, null, formData);
    
    if (result?.error) {
      setError(result.error);
      return;
    }
    
    toast.success('Task created successfully');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Add a new task to a project.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4 pt-4">
          {error && <div className="text-sm text-rose-500 font-medium">{error}</div>}
          
          <div className="space-y-2">
            <Label htmlFor="title">Task Title <span className="text-rose-500">*</span></Label>
            <Input id="title" name="title" placeholder="Design landing page" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_id">Project <span className="text-rose-500">*</span></Label>
            <select
              id="project_id"
              name="project_id"
              defaultValue={defaultProjectId || ""}
              required
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Select a project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_to">Assignee</Label>
            <select
              id="assigned_to"
              name="assigned_to"
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="unassigned">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date</Label>
            <Input id="due_date" name="due_date" type="date" />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
