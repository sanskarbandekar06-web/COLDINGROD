'use client';

import { useActionState, useState } from 'react';
import { CheckCircle2, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { inviteMember } from '@/actions/member';
import { PermissionMatrix } from './PermissionMatrix';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PermissionItem } from '@/services/member.service';

interface InviteMemberModalProps {
  workspaceId: string;
  availablePermissions: PermissionItem[];
}

export function InviteMemberModal(props: InviteMemberModalProps) {
  const [session, setSession] = useState(0);
  return (
    <InviteMemberModalSession
      key={session}
      {...props}
      onReset={() => setSession((value) => value + 1)}
    />
  );
}

function InviteMemberModalSession({
  workspaceId,
  availablePermissions,
  onReset,
}: InviteMemberModalProps & { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [state, formAction, isPending] = useActionState(inviteMember, null);

  const copyInvite = async () => {
    if (!state?.inviteUrl) return;
    await navigator.clipboard.writeText(state.inviteUrl);
    toast.success('Invitation link copied');
  };

  const mailto = state?.inviteUrl
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('You are invited to Coldingrod')}&body=${encodeURIComponent(`Join the workspace using this secure invitation link:\n\n${state.inviteUrl}`)}`
    : '';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) onReset(); }}>
      <DialogTrigger render={<Button />}>Invite Member</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite to Workspace</DialogTitle>
          <DialogDescription>
            Create a secure invitation link, then copy it or open a pre-filled email in your mail app.
          </DialogDescription>
        </DialogHeader>

        {state?.success && state.inviteUrl ? (
          <div className="space-y-5 pt-4">
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle>Invitation ready</AlertTitle>
              <AlertDescription>
                Share this link with {email}. It expires automatically and can be revoked from Invitations.
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm break-all">
              {state.inviteUrl}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={copyInvite}>
                <Copy className="size-4" /> Copy link
              </Button>
              <a href={mailto} className={buttonVariants()}>
                <Mail className="size-4" /> Open email
              </a>
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); onReset(); }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-6 pt-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            {selectedPermissions.map((permission) => (
              <input key={permission} type="hidden" name="permissions" value={permission} />
            ))}
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiration">Invite Expiration</Label>
              <Select name="expiration" defaultValue="7">
                <SelectTrigger id="expiration"><SelectValue placeholder="Select duration" /></SelectTrigger>
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
                <AlertTitle>Invitation could not be created</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-3 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); onReset(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating…' : 'Create Invite'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
