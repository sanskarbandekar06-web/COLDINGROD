'use client';

/**
 * EditMessageDialog — Human edit of outreach message content
 *
 * Security:
 * - messageId comes from server-rendered page props
 * - workspaceId comes from server-rendered page props
 * - editor identity derived server-side in the action
 * - edit blocked server-side if status is not editable or approval decided
 */

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';
import { updateMessageContentAction } from '@/actions/outreach';
import { toast } from 'sonner';

interface EditMessageDialogProps {
  workspaceSlug: string;
  workspaceId: string;
  messageId: string;
  currentContent: string;
  currentSubject?: string | null;
  platform: string;
  defaultOpen?: boolean;
  canEdit: boolean;
  editBlockedReason?: string;
}

export function EditMessageDialog({
  workspaceSlug,
  workspaceId,
  messageId,
  currentContent,
  currentSubject = null,
  platform,
  defaultOpen = false,
  canEdit,
  editBlockedReason,
}: EditMessageDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(currentContent);
  const [subject, setSubject] = useState(currentSubject ?? '');
  const [changeReason, setChangeReason] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateMessageContentAction(
        workspaceSlug,
        workspaceId,
        messageId,
        content,
        platform === 'email' ? subject : null,
        changeReason.trim() || null
      );
      if (result.success) {
        toast.success('Message content saved.');
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled className="flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
        {editBlockedReason && (
          <p className="text-xs text-muted-foreground">{editBlockedReason}</p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="flex items-center gap-1.5" />}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" aria-describedby="edit-msg-desc">
        <DialogHeader>
          <DialogTitle>Edit Message</DialogTitle>
          <p id="edit-msg-desc" className="text-sm text-muted-foreground">
            Editing saves a new version in the audit trail. The original is preserved.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {platform === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-subject">Email subject</Label>
              <Input
                id="edit-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={300}
                placeholder="Email subject…"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="edit-content">Message content *</Label>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[150px]"
              required
              maxLength={10000}
              aria-label="Message content"
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length} / 10,000
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-reason">Reason for edit (optional)</Label>
            <Input
              id="change-reason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Tone adjustment, corrected typos…"
              maxLength={200}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                (content.trim() === currentContent && subject.trim() === (currentSubject ?? ''))
              }
            >
              {isPending ? 'Saving…' : 'Save version'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
