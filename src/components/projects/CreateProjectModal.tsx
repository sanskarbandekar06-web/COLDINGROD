'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createProjectAction } from '@/actions/projects';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  clients: { id: string, name: string }[];
  members: { id: string, full_name: string }[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Project'}
    </Button>
  );
}

export function CreateProjectModal({ isOpen, onClose, workspaceId, clients, members }: CreateProjectModalProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await createProjectAction(workspaceId, null, formData);
    
    if (result?.error) {
      setError(result.error);
      return;
    }
    
    toast.success('Project created successfully');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Add a new project to your workspace.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4 pt-4">
          {error && <div className="text-sm text-rose-500 font-medium">{error}</div>}
          
          <div className="space-y-2">
            <Label htmlFor="name">Project Name <span className="text-rose-500">*</span></Label>
            <Input id="name" name="name" placeholder="Website Redesign" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_id">Client</Label>
            <select
              id="client_id"
              name="client_id"
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="unassigned">No Client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_id">Owner</Label>
            <select
              id="owner_id"
              name="owner_id"
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="unassigned">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
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
