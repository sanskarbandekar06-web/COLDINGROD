'use client';

import { useTransition } from 'react';
import { format } from 'date-fns';
import { Copy, Mail, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { revokeWorkspaceInvite } from '@/actions/member';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { WorkspaceInvitation } from '@/services/invitation.service';

export function InvitationsTable({
  invitations,
  workspaceId,
  appUrl,
}: {
  invitations: WorkspaceInvitation[];
  workspaceId: string;
  appUrl: string;
}) {
  const [pending, startTransition] = useTransition();

  const inviteUrl = (token: string) => `${appUrl}/invite/${token}`;
  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success('Invitation link copied');
  };
  const revoke = (inviteId: string) => {
    if (!confirm('Revoke this invitation? The existing link will stop working.')) return;
    startTransition(async () => {
      const result = await revokeWorkspaceInvite(workspaceId, inviteId);
      if (result.error) toast.error(result.error);
      else toast.success('Invitation revoked');
    });
  };

  if (invitations.length === 0) {
    return (
      <div className="coldingrod-card py-14 text-center text-sm text-muted-foreground">
        No invitations have been created for this workspace.
      </div>
    );
  }

  return (
    <div className="coldingrod-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invitee</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invite) => {
            const expired = invite.isExpired;
            const active = invite.status === 'pending' && !invite.revokedAt && !expired;
            const label = invite.revokedAt
              ? 'Revoked'
              : expired && invite.status === 'pending'
                ? 'Expired'
                : invite.status;
            const url = inviteUrl(invite.token);
            const mailto = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent('You are invited to Coldingrod')}&body=${encodeURIComponent(`Join the workspace using this secure invitation link:\n\n${url}`)}`;
            return (
              <TableRow key={invite.id}>
                <TableCell>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(invite.createdAt), 'MMM d, yyyy')}
                  </p>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{label}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {invite.grantedPermissions.length
                    ? `${invite.grantedPermissions.length} assigned`
                    : 'Basic access'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(invite.expiresAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {active && (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => copy(invite.token)}>
                          <Copy className="size-4" /> Copy
                        </Button>
                        <a href={mailto} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                          <Mail className="size-4" /> Email
                        </a>
                        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => revoke(invite.id)} className="text-destructive">
                          <ShieldX className="size-4" /> Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
