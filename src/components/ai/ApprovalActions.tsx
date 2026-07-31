'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveAiRequestAction, rejectAiRequestAction } from '@/actions/ai-approvals';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApprovalActionsProps {
  workspaceId: string;
  actionId: string;
  workspaceSlug: string;
}

export function ApprovalActions({ workspaceId, actionId, workspaceSlug }: ApprovalActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);

  const handleApprove = () => {
    if (!confirmApprove) {
      setConfirmApprove(true);
      return;
    }
    startTransition(async () => {
      const result = await approveAiRequestAction(workspaceId, actionId, workspaceSlug);
      if (!result?.success) {
        // Refresh on stale state so the UI updates to reflect the current state
        if (result?.code === 'STALE_APPROVAL') {
          toast.error(result.error || 'This request has already been reviewed.');
          router.refresh();
        } else {
          toast.error(result?.error || 'Approval failed. Please try again.');
        }
        setConfirmApprove(false);
      } else {
        toast.success('Action approved successfully.');
        router.push(`/dashboard/${workspaceSlug}/ai/approvals`);
      }
    });
  };

  const handleReject = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast.error('Please provide a rejection reason (at least 3 characters).');
      return;
    }
    if (trimmed.length > 1000) {
      toast.error('Rejection reason must not exceed 1000 characters.');
      return;
    }
    startTransition(async () => {
      const result = await rejectAiRequestAction(workspaceId, actionId, workspaceSlug, trimmed);
      if (!result?.success) {
        if (result?.code === 'STALE_APPROVAL') {
          toast.error(result.error || 'This request has already been reviewed.');
          router.refresh();
        } else {
          toast.error(result?.error || 'Rejection failed. Please try again.');
        }
      } else {
        toast.success('Action rejected.');
        router.push(`/dashboard/${workspaceSlug}/ai/approvals`);
      }
    });
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <h3 className="font-semibold text-sm">Pending Review</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Review the details above before making a decision. Approval does not automatically execute
        this action — a separate execution step is required.
      </p>

      {!showRejectForm && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleApprove}
            disabled={isPending}
            className={`flex-1 ${confirmApprove ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600' : ''}`}
            aria-label={confirmApprove ? 'Confirm approval of this AI action' : 'Approve this AI action'}
          >
            {isPending && confirmApprove ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" aria-hidden />
            )}
            {confirmApprove ? 'Confirm Approval' : 'Approve'}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setShowRejectForm(true);
              setConfirmApprove(false);
            }}
            disabled={isPending}
            className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950"
            aria-label="Reject this AI action"
          >
            <XCircle className="h-4 w-4 mr-2" aria-hidden />
            Reject
          </Button>
        </div>
      )}

      {confirmApprove && !showRejectForm && (
        <button
          type="button"
          onClick={() => setConfirmApprove(false)}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      )}

      {showRejectForm && (
        <div className="space-y-3">
          <div>
            <label htmlFor="rejection-reason" className="block text-sm font-medium mb-1">
              Rejection Reason <span className="text-rose-500" aria-hidden>*</span>
            </label>
            <textarea
              id="rejection-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this action is being rejected (3–1000 characters)..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              disabled={isPending}
              maxLength={1000}
              aria-describedby="reason-hint"
            />
            <p id="reason-hint" className="text-xs text-muted-foreground mt-1">
              {reason.length}/1000 characters
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleReject}
              disabled={isPending || reason.trim().length < 3 || reason.trim().length > 1000}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
              aria-label="Confirm rejection of this AI action"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 mr-2" aria-hidden />
              )}
              Confirm Rejection
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectForm(false);
                setReason('');
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
