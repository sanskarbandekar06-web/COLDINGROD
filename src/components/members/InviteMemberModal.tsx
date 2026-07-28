'use client';

import { useState, useActionState } from 'react';
import { inviteMember } from '@/actions/member';
import type { PermissionItem } from '@/services/member.service';
import { PermissionMatrix } from './PermissionMatrix';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function InviteMemberModal({
  workspaceId,
  availablePermissions
}: {
  workspaceId: string;
  availablePermissions: PermissionItem[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [state, formAction, isPending] = useActionState(inviteMember, null);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedPermissions([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>Invite Member</Button>} />
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite to Workspace</DialogTitle>
          <DialogDescription>
            Send an invitation email to a new team member. They will need to accept the invite to join.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6 pt-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {selectedPermissions.map(p => (
            <input key={p} type="hidden" name="permissions" value={p} />
          ))}

          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" name="email" type="email" placeholder="colleague@example.com" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="expiration">Invite Expiration</Label>
            <Select name="expiration" defaultValue="7">
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Day</SelectItem>
                <SelectItem value="3">3 Days</SelectItem>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Initial Permissions</Label>
            <PermissionMatrix 
              availablePermissions={availablePermissions}
              selectedPermissions={selectedPermissions}
              onChange={setSelectedPermissions}
            />
          </div>

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {state?.success && (
            <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Invitation sent successfully.</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
