'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore } from 'lucide-react';
import { archiveOutreachMessageAction, restoreOutreachMessageAction } from '@/actions/outreach';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface ArchiveRestoreButtonProps {
  workspaceSlug: string;
  workspaceId: string;
  messageId: string;
  isArchived: boolean;
}

export function ArchiveRestoreButton({
  workspaceSlug,
  workspaceId,
  messageId,
  isArchived,
}: ArchiveRestoreButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = isArchived
        ? await restoreOutreachMessageAction(workspaceSlug, workspaceId, messageId)
        : await archiveOutreachMessageAction(workspaceSlug, workspaceId, messageId);

      if (result.success) {
        toast.success(isArchived ? 'Message restored.' : 'Message archived.');
        router.push(`/dashboard/${workspaceSlug}/outreach/messages`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label={isArchived ? 'Restore message' : 'Archive message'}
      className="flex items-center gap-1.5"
    >
      {isArchived ? (
        <>
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
          Restore
        </>
      ) : (
        <>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          Archive
        </>
      )}
    </Button>
  );
}
