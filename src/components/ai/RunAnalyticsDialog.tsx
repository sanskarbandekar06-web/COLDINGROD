'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { runWorkspaceAnalyticsAction } from '@/actions/analytics';
import { Button } from '@/components/ui/button';
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

const PERIODS = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
};

export function RunAnalyticsDialog({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState('30');

  function runAnalytics() {
    startTransition(async () => {
      const result = await runWorkspaceAnalyticsAction(
        workspaceSlug,
        Number(period),
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Immutable analytics snapshot created.');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button />}>
        <BarChart3 className="size-4" aria-hidden="true" />
        Run analytics
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Analytics and Optimization Agent</DialogTitle>
          <DialogDescription>
            Create an immutable funnel snapshot from stored workspace outcomes.
            Recommendations use transparent rules and never invent results.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            runAnalytics();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="analytics-period">Reporting period</Label>
            <Select
              value={period}
              onValueChange={(value) => setPeriod(value ?? '30')}
            >
              <SelectTrigger
                id="analytics-period"
                className="w-full"
                aria-label="Select analytics period"
              >
                <SelectValue>
                  {PERIODS[period as keyof typeof PERIODS]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
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
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <BarChart3 className="size-4" aria-hidden="true" />
              )}
              Generate snapshot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
