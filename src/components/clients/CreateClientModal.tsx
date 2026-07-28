'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createClientAction } from '@/actions/clients';

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Client'}
    </Button>
  );
}

export function CreateClientModal({ isOpen, onClose, workspaceId }: CreateClientModalProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result = await createClientAction(workspaceId, null, formData);
    
    if (result?.error) {
      setError(result.error);
      return;
    }
    
    toast.success('Client created successfully');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Client</DialogTitle>
          <DialogDescription>
            Add a new client to your workspace.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4 pt-4">
          {error && <div className="text-sm text-rose-500 font-medium">{error}</div>}
          
          <div className="space-y-2">
            <Label htmlFor="name">Company Name <span className="text-rose-500">*</span></Label>
            <Input id="name" name="name" placeholder="Acme Corp" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" type="url" placeholder="https://acme.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" name="industry" placeholder="Technology" />
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
