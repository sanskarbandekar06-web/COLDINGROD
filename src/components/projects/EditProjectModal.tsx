'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { updateProjectAction } from '@/actions/projects';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Project } from '@/types/project';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>;
}

export function EditProjectModal({
  open,
  onClose,
  workspaceId,
  project,
  clients,
  members,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  project: Project;
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = async (formData: FormData) => {
    setError(null);
    const result = await updateProjectAction(workspaceId, project.id, null, formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success('Project updated');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Update project identity, ownership, and client relationship.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4 pt-4">
          {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">Project name</Label>
            <Input id="edit-project-name" name="name" defaultValue={project.name} maxLength={200} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-description">Description</Label>
            <Textarea
              id="edit-project-description"
              name="description"
              defaultValue={project.description || ''}
              maxLength={2000}
              rows={4}
              placeholder="Scope, outcome, or delivery context"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-client">Client</Label>
            <select
              id="edit-project-client"
              name="client_id"
              defaultValue={project.client_id || 'unassigned'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="unassigned">No client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-owner">Owner</Label>
            <select
              id="edit-project-owner"
              name="owner_id"
              defaultValue={project.owner_id || 'unassigned'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="unassigned">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
            </select>
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
