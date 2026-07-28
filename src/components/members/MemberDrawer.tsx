'use client';

import { useEffect, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ShieldAlert, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { removeMember, updateMemberPermissions } from '@/actions/member';
import type { MemberData, PermissionItem } from '@/services/member.service';
import { PermissionMatrix } from './PermissionMatrix';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MemberDrawerProps {
  member: MemberData | null;
  isOpen: boolean;
  onClose: () => void;
  availablePermissions: PermissionItem[];
  canManage: boolean;
  workspaceId: string;
  currentMemberId: string;
}

export function MemberDrawer({
  member,
  isOpen,
  onClose,
  availablePermissions,
  canManage,
  workspaceId,
  currentMemberId,
}: MemberDrawerProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedPermissions(member?.permissions ?? []);
  }, [member]);

  const handleSavePermissions = () => {
    if (!member) return;
    const permissionIds = availablePermissions
      .filter((permission) => selectedPermissions.includes(permission.key))
      .map((permission) => permission.id);

    startTransition(async () => {
      const result = await updateMemberPermissions(
        workspaceId,
        member.id,
        permissionIds
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Member permissions updated');
      onClose();
    });
  };

  const handleRemoveMember = () => {
    if (
      !member ||
      !confirm('Are you sure you want to remove this member from the workspace?')
    ) {
      return;
    }

    startTransition(async () => {
      const result = await removeMember(workspaceId, member.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Member removed');
      onClose();
    });
  };

  if (!member) return null;
  const isCurrentMember = member.id === currentMemberId;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="flex flex-row items-center gap-4 space-y-0 border-b pb-6 text-left">
          <Avatar className="h-16 w-16 border">
            {member.user.avatar_url && <AvatarImage src={member.user.avatar_url} />}
            <AvatarFallback className="bg-primary/10 text-lg text-primary">
              {member.user.full_name?.charAt(0) ||
                member.user.email.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle className="text-xl">
              {member.user.full_name || 'Unnamed User'}
              {isCurrentMember && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (you)
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-sm">{member.user.email}</SheetDescription>
            <div className="mt-1 text-xs text-muted-foreground">
              Joined {format(new Date(member.joined_at), 'PPP')}
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="permissions" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="activity">Activity &amp; Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="permissions" className="mt-4 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Access Level
              </div>
              <PermissionMatrix
                availablePermissions={availablePermissions}
                selectedPermissions={selectedPermissions}
                onChange={setSelectedPermissions}
                disabled={!canManage || isPending}
              />

              {canManage && (
                <Button
                  onClick={handleSavePermissions}
                  disabled={isPending}
                  className="mt-4 w-full"
                >
                  {isPending ? 'Saving...' : 'Save Permissions'}
                </Button>
              )}
            </div>

            {canManage && !isCurrentMember && (
              <div className="mt-6 border-t pt-6">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
                  <UserMinus className="h-4 w-4" /> Danger Zone
                </h4>
                <p className="mb-4 text-xs text-muted-foreground">
                  Removing this member immediately revokes their workspace access.
                </p>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleRemoveMember}
                  disabled={isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Member
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              Individual member activity and assignments will appear here.
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
