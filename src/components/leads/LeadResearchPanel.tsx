'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileText,
  Lightbulb,
  Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { runLeadResearchAction } from '@/actions/lead-research';
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
import { Textarea } from '@/components/ui/textarea';
import type {
  LeadPainPoint,
  LeadResearchReport,
} from '@/types/lead-research';

function priorityClasses(priority: LeadPainPoint['priority']) {
  if (priority === 'high') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300';
  }
  if (priority === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'border-border bg-muted text-muted-foreground';
}

export function LeadResearchPanel({
  workspaceSlug,
  leadId,
  canRun,
  isQualified,
  latest,
}: {
  workspaceSlug: string;
  leadId: string;
  canRun: boolean;
  isQualified: boolean;
  latest: LeadResearchReport | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [offerings, setOfferings] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [differentiators, setDifferentiators] = useState('');
  const [recentActivity, setRecentActivity] = useState('');
  const [observedChallenges, setObservedChallenges] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [sourceUrls, setSourceUrls] = useState('');

  function runResearch() {
    startTransition(async () => {
      const result = await runLeadResearchAction({
        workspaceSlug,
        leadId,
        research: {
          offerings,
          targetAudience,
          differentiators,
          recentActivity,
          observedChallenges,
          evidenceNotes,
          sourceUrls: sourceUrls
            .split(/\r?\n/)
            .map((source) => source.trim())
            .filter(Boolean),
        },
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Research complete: ${result.painPointCount} evidence-backed pain point${result.painPointCount === 1 ? '' : 's'}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {latest ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Evidence confidence
              </p>
              <p className="mt-1 text-2xl font-bold">{latest.confidence}%</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Search className="size-5" aria-hidden="true" />
            </div>
          </div>

          {latest.pain_points.length > 0 ? (
            <div className="space-y-3">
              {latest.pain_points.slice(0, 4).map((point) => (
                <div key={point.key} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{point.label}</p>
                    <Badge
                      variant="outline"
                      className={priorityClasses(point.priority)}
                    >
                      {point.priority} priority
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Evidence: {point.evidence}
                  </p>
                  <p className="mt-2 text-sm">{point.impact}</p>
                  <div className="mt-3 flex gap-2 rounded-md bg-primary/5 p-2 text-sm text-primary">
                    <Lightbulb
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{point.service_opportunity}</span>
                  </div>
                </div>
              ))}
              {latest.pain_points.length > 4 && (
                <p className="text-xs text-muted-foreground">
                  +{latest.pain_points.length - 4} more pain points retained in
                  the analysis action.
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-3 rounded-lg border p-3">
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                No positive opportunity factors were found in the latest
                qualification evidence.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/${workspaceSlug}/leads/${leadId}/reports/summary`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FileText className="size-4" aria-hidden="true" />
              Executive Summary
            </Link>
            <Link
              href={`/dashboard/${workspaceSlug}/leads/${leadId}/reports/detailed`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FileSearch className="size-4" aria-hidden="true" />
              Detailed Analysis Report
            </Link>
            <Link
              href={`/dashboard/${workspaceSlug}/ai/actions/${latest.analysis_action_id}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <Bot className="size-4" aria-hidden="true" />
              View analysis action
            </Link>
            {latest.source_urls.map((source, index) => (
              <a
                key={source}
                href={source}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Source {index + 1}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="rounded-xl bg-secondary/10 p-3 text-secondary">
            <Search className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-3 font-medium">No research report yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Add verified business context after qualification to map observed
            gaps to transparent service opportunities.
          </p>
        </div>
      )}

      {!isQualified ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Run Lead Qualification first. Research pain points use its stored
          evidence instead of guessing from free-form text.
        </p>
      ) : canRun ? (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!pending) setOpen(nextOpen);
          }}
        >
          <DialogTrigger render={<Button className="w-full" />}>
            <Search className="size-4" aria-hidden="true" />
            {latest ? 'Refresh business research' : 'Research this business'}
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Business Research Agent</DialogTitle>
              <DialogDescription>
                Add at least two verified fields. Pain points come only from the
                lead’s latest qualification factors; these notes add context,
                not unsupported claims.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                runResearch();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="research-offerings">Offerings</Label>
                  <Textarea
                    id="research-offerings"
                    value={offerings}
                    onChange={(event) => setOfferings(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Verified products or services."
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="research-audience">Target audience</Label>
                  <Textarea
                    id="research-audience"
                    value={targetAudience}
                    onChange={(event) => setTargetAudience(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Who the public offer is designed for."
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="research-differentiators">
                    Differentiators
                  </Label>
                  <Textarea
                    id="research-differentiators"
                    value={differentiators}
                    onChange={(event) => setDifferentiators(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Only differentiators stated in evidence."
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="research-activity">Recent activity</Label>
                  <Textarea
                    id="research-activity"
                    value={recentActivity}
                    onChange={(event) => setRecentActivity(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Public launches, hiring, posts, or updates."
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="research-challenges">
                    Observed challenges
                  </Label>
                  <Textarea
                    id="research-challenges"
                    value={observedChallenges}
                    onChange={(event) =>
                      setObservedChallenges(event.target.value)
                    }
                    maxLength={1000}
                    rows={3}
                    placeholder="Challenges explicitly visible in evidence."
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="research-evidence">Evidence notes</Label>
                  <Textarea
                    id="research-evidence"
                    value={evidenceNotes}
                    onChange={(event) => setEvidenceNotes(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Where and how this information was observed."
                    disabled={pending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="research-sources">
                  Source URLs <span className="text-muted-foreground">(one per line)</span>
                </Label>
                <Textarea
                  id="research-sources"
                  value={sourceUrls}
                  onChange={(event) => setSourceUrls(event.target.value)}
                  rows={3}
                  placeholder={'https://business.example\nhttps://directory.example/listing'}
                  disabled={pending}
                  aria-describedby="research-source-guidance"
                />
                <p
                  id="research-source-guidance"
                  className="text-xs text-muted-foreground"
                >
                  Up to 10 HTTP(S) sources. Duplicate URLs are stored once.
                </p>
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
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Researching…
                    </>
                  ) : (
                    <>
                      <Search className="size-4" aria-hidden="true" />
                      Run research
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          AI and lead management permissions are required to run research.
        </p>
      )}
    </div>
  );
}
