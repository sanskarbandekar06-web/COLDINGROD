'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CalendarClock,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createFollowUpSequenceAction,
  prepareDueFollowUpAction,
  setFollowUpSequenceStatusAction,
} from '@/actions/follow-up';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FollowUpSequence } from '@/types/follow-up';

const CADENCE_LABELS = {
  standard: 'Standard · days 3, 7, and 14',
  gentle: 'Gentle · days 5 and 12',
  compact: 'Compact · days 3 and 8',
};

function stoppedReason(reason: string | null) {
  if (reason === 'response_detected') {
    return 'Stopped after a response was detected.';
  }
  if (reason === 'lead_pipeline_terminal') {
    return 'Stopped because the lead pipeline advanced.';
  }
  if (reason === 'cadence_exhausted') {
    return 'All planned follow-ups were prepared.';
  }
  if (reason === 'cancelled_by_user') {
    return 'Cancelled by a workspace member.';
  }
  return reason ? reason.replaceAll('_', ' ') : null;
}

export function FollowUpSequencePanel({
  workspaceSlug,
  currentMessageId,
  messageStatus,
  approvalDecision,
  isAiGenerated,
  canManage,
  sequence,
}: {
  workspaceSlug: string;
  currentMessageId: string;
  messageStatus: string;
  approvalDecision: string | undefined;
  isAiGenerated: boolean;
  canManage: boolean;
  sequence: FollowUpSequence | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState('standard');
  const [confirmCancel, setConfirmCancel] = useState(false);

  function createSequence() {
    startTransition(async () => {
      const result = await createFollowUpSequenceAction({
        workspaceSlug,
        messageId: currentMessageId,
        cadence,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Response-aware follow-up sequence created.');
      setOpen(false);
      router.refresh();
    });
  }

  function prepareNext() {
    if (!sequence) return;
    startTransition(async () => {
      const result = await prepareDueFollowUpAction({
        workspaceSlug,
        sequenceId: sequence.id,
        messageId: currentMessageId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.outcome === 'prepared' && result.messageId) {
        toast.success('Follow-up draft prepared for human review.');
        router.push(
          `/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}`,
        );
        return;
      }
      if (result.outcome === 'not_due' && result.dueAt) {
        toast.info(
          `The next follow-up is due ${formatDistanceToNow(new Date(result.dueAt), { addSuffix: true })}.`,
        );
      } else if (result.outcome === 'waiting_for_previous_delivery') {
        toast.info('Verify delivery of the previous follow-up first.');
      } else if (result.outcome === 'stopped') {
        toast.success(
          'Sequence stopped because a response or pipeline change was detected.',
        );
      } else if (result.outcome === 'paused') {
        toast.info('Resume the sequence before preparing another draft.');
      } else {
        toast.info('No follow-up draft is due.');
      }
      router.refresh();
    });
  }

  function setStatus(status: 'active' | 'paused' | 'cancelled') {
    if (!sequence) return;
    startTransition(async () => {
      const result = await setFollowUpSequenceStatusAction({
        workspaceSlug,
        sequenceId: sequence.id,
        messageId: currentMessageId,
        status,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        status === 'active'
          ? 'Follow-up sequence resumed.'
          : status === 'paused'
            ? 'Follow-up sequence paused.'
            : 'Follow-up sequence cancelled.',
      );
      setConfirmCancel(false);
      router.refresh();
    });
  }

  if (!sequence) {
    const delivered = ['sent', 'delivered'].includes(messageStatus);
    const ready =
      delivered && isAiGenerated && approvalDecision === 'approved';

    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
          <ShieldCheck
            className="mt-0.5 size-5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">Response-aware and review-only</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Timing starts from verified delivery. A response or advanced lead
              state stops future steps. Due steps create drafts for approval;
              they are never sent automatically.
            </p>
          </div>
        </div>

        {!delivered ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Follow-up timing becomes available after a real integration records
            this message as sent or delivered.
          </p>
        ) : !isAiGenerated || approvalDecision !== 'approved' ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Follow-up automation requires an AI-generated message with a stored
            human approval.
          </p>
        ) : !canManage ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            AI and lead management permissions are required.
          </p>
        ) : (
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!pending) setOpen(nextOpen);
            }}
          >
            <DialogTrigger
              render={<Button className="w-full" disabled={!ready} />}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              Plan follow-up sequence
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Follow-Up Agent</DialogTitle>
                <DialogDescription>
                  Select a safe cadence measured from the original verified
                  delivery time.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createSequence();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="follow-up-cadence">Cadence</Label>
                  <Select
                    value={cadence}
                    onValueChange={(value) =>
                      setCadence(value ?? 'standard')
                    }
                  >
                    <SelectTrigger
                      id="follow-up-cadence"
                      className="w-full"
                      aria-label="Select follow-up cadence"
                    >
                      <SelectValue>
                        {CADENCE_LABELS[
                          cadence as keyof typeof CADENCE_LABELS
                        ]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CADENCE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <CalendarClock className="size-4" aria-hidden="true" />
                    )}
                    Create sequence
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Response-aware sequence</p>
          <p className="text-xs text-muted-foreground">
            Days {sequence.cadence_days.join(', ')} from verified delivery
          </p>
        </div>
        <Badge
          variant={
            sequence.status === 'cancelled'
              ? 'destructive'
              : sequence.status === 'active'
                ? 'default'
                : 'secondary'
          }
          className="capitalize"
        >
          {sequence.status}
        </Badge>
      </div>

      <div className="space-y-2">
        {sequence.steps.map((step) => (
          <div
            key={step.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">Follow-up {step.step_number}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Due {format(new Date(step.due_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="capitalize">
                {step.status.replaceAll('_', ' ')}
              </Badge>
              {step.message_id && (
                <Link
                  href={`/dashboard/${workspaceSlug}/outreach/messages/${step.message_id}`}
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                  })}
                >
                  <MessageSquareText className="size-4" aria-hidden="true" />
                  View draft
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {sequence.stopped_reason && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          {stoppedReason(sequence.stopped_reason)}
        </p>
      )}

      {canManage && ['active', 'paused'].includes(sequence.status) && (
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={prepareNext}
            disabled={pending || sequence.status === 'paused'}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessageSquareText className="size-4" aria-hidden="true" />
            )}
            Check and prepare next due draft
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {sequence.status === 'active' ? (
              <Button
                variant="outline"
                onClick={() => setStatus('paused')}
                disabled={pending}
              >
                <Pause className="size-4" aria-hidden="true" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setStatus('active')}
                disabled={pending}
              >
                <Play className="size-4" aria-hidden="true" />
                Resume
              </Button>
            )}
            <Button
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
              onClick={() => {
                if (confirmCancel) setStatus('cancelled');
                else setConfirmCancel(true);
              }}
              disabled={pending}
            >
              <XCircle className="size-4" aria-hidden="true" />
              {confirmCancel ? 'Confirm cancel' : 'Cancel sequence'}
            </Button>
          </div>
          {confirmCancel && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setConfirmCancel(false)}
              disabled={pending}
            >
              Keep sequence
            </button>
          )}
        </div>
      )}
    </div>
  );
}
