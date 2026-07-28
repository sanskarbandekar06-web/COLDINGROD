'use client';

import React, { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { archiveMeetingAction, restoreMeetingAction } from '@/actions/meeting';
import { toast } from 'sonner';

interface ArchiveRestoreButtonProps {
  meetingId: string;
  workspaceSlug: string;
  isArchived: boolean;
}

export function ArchiveRestoreButton({ meetingId, workspaceSlug, isArchived }: ArchiveRestoreButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleAction = () => {
    startTransition(async () => {
      let result;
      if (isArchived) {
        result = await restoreMeetingAction(meetingId, workspaceSlug);
      } else {
        result = await archiveMeetingAction(meetingId, workspaceSlug);
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Meeting ${isArchived ? 'restored' : 'archived'} successfully`);
      }
    });
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleAction} 
      disabled={isPending}
      className={isArchived ? 'text-green-600 border-green-200 hover:bg-green-50' : 'text-red-600 border-red-200 hover:bg-red-50'}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : isArchived ? (
        <ArchiveRestore className="h-4 w-4 mr-2" />
      ) : (
        <Archive className="h-4 w-4 mr-2" />
      )}
      {isArchived ? 'Restore' : 'Archive'}
    </Button>
  );
}
