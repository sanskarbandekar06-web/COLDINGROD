'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  archiveAssetAction,
  renameAssetAction,
  restoreAssetAction,
} from '@/actions/assets';
import { permanentlyDeleteAssetAction } from '@/actions/asset-delete';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AssetRowActionsProps {
  assetId: string;
  assetName: string;
  workspaceId: string;
  archived: boolean;
  canManage: boolean;
}

export function AssetRowActions({
  assetId,
  assetName,
  workspaceId,
  archived,
  canManage,
}: AssetRowActionsProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(assetName);
  const [isPending, startTransition] = useTransition();

  function refreshWithToast(message: string): void {
    toast.success(message);
    router.refresh();
  }

  function rename(): void {
    startTransition(async () => {
      const result = await renameAssetAction(workspaceId, assetId, name);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRenameOpen(false);
      refreshWithToast('File renamed.');
    });
  }

  function changeArchivedState(): void {
    startTransition(async () => {
      const result = archived
        ? await restoreAssetAction(workspaceId, assetId)
        : await archiveAssetAction(workspaceId, assetId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      refreshWithToast(archived ? 'File restored.' : 'File archived.');
    });
  }

  function permanentlyDelete(): void {
    const confirmed = window.confirm(
      `Permanently delete "${assetName}"? This removes the stored file and cannot be undone.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await permanentlyDeleteAssetAction(workspaceId, assetId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      refreshWithToast('File permanently deleted.');
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${assetName}`}
            />
          }
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<a href={`/api/assets/${assetId}/download`} />}
          >
            <Download />
            Download
          </DropdownMenuItem>
          {canManage && !archived && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setName(assetName);
                  setRenameOpen(true);
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canManage && (
            <DropdownMenuItem
              variant={archived ? 'default' : 'destructive'}
              onClick={changeArchivedState}
              disabled={isPending}
            >
              {archived ? <RotateCcw /> : <Archive />}
              {archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
          )}
          {canManage && archived && (
            <DropdownMenuItem
              variant="destructive"
              onClick={permanentlyDelete}
              disabled={isPending}
            >
              <Trash2 />
              Delete permanently
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              This changes the displayed name. The private stored object remains
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`asset-name-${assetId}`}>File name</Label>
            <Input
              id={`asset-name-${assetId}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') rename();
              }}
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={rename}
              disabled={isPending || !name.trim()}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
