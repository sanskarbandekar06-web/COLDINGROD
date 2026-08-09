'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { importLeadDiscoveryCandidatesAction } from '@/actions/lead-discovery';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { LeadDiscoveryCandidate } from '@/types/lead-discovery';

const STATUS_LABELS = {
  ready: 'Ready',
  duplicate: 'Duplicate',
  imported: 'Imported',
  dismissed: 'Dismissed',
} as const;

function statusVariant(status: LeadDiscoveryCandidate['status']) {
  if (status === 'ready') return 'default' as const;
  if (status === 'imported') return 'secondary' as const;
  return 'outline' as const;
}

export function DiscoveryCandidateReview({
  workspaceSlug,
  runId,
  candidates,
  canImport,
}: {
  workspaceSlug: string;
  runId: string;
  candidates: LeadDiscoveryCandidate[];
  canImport: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const readyIds = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.status === 'ready')
        .map((candidate) => candidate.id),
    [candidates],
  );

  function toggleCandidate(candidateId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }

  function importSelected() {
    startTransition(async () => {
      const result = await importLeadDiscoveryCandidatesAction({
        workspaceSlug,
        runId,
        candidateIds: [...selected],
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const duplicateNote =
        result.duplicateCount > 0
          ? ` ${result.duplicateCount} became duplicate before import.`
          : '';
      toast.success(
        `${result.importedCount} lead${result.importedCount === 1 ? '' : 's'} imported.${duplicateNote}`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <section className="space-y-4" aria-labelledby="candidate-review-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="candidate-review-title" className="text-lg font-semibold">
            Candidate review
          </h2>
          <p className="text-sm text-muted-foreground">
            Select only the ready businesses you want to create as leads.
          </p>
        </div>
        {canImport && readyIds.length > 0 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSelected(
                  selected.size === readyIds.length
                    ? new Set()
                    : new Set(readyIds),
                )
              }
              disabled={pending}
            >
              {selected.size === readyIds.length ? 'Clear selection' : 'Select all ready'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {candidates.map((candidate) => {
          const selectable = canImport && candidate.status === 'ready';
          const checked = selected.has(candidate.id);
          const linkedLead = candidate.imported_lead ?? candidate.matched_lead;
          return (
            <Card
              key={candidate.id}
              className={cn(
                selectable && 'transition-shadow hover:ring-primary/40',
                checked && 'ring-2 ring-primary',
              )}
            >
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {selectable && (
                    <Checkbox
                      id={`candidate-${candidate.id}`}
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        toggleCandidate(candidate.id, nextChecked)
                      }
                      disabled={pending}
                      aria-label={`Select ${candidate.company_name}`}
                      className="mt-1"
                    />
                  )}
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      {candidate.company_name}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Candidate {candidate.source_index}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant(candidate.status)}>
                  {STATUS_LABELS[candidate.status]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm">
                  {candidate.industry && (
                    <div className="flex items-center gap-2">
                      <Building2
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">Industry</dt>
                      <dd>{candidate.industry}</dd>
                    </div>
                  )}
                  {candidate.location && (
                    <div className="flex items-center gap-2">
                      <MapPin
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">Location</dt>
                      <dd>{candidate.location}</dd>
                    </div>
                  )}
                  {candidate.business_email && (
                    <div className="flex items-center gap-2">
                      <Mail
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">Email</dt>
                      <dd className="break-all">{candidate.business_email}</dd>
                    </div>
                  )}
                  {candidate.business_phone && (
                    <div className="flex items-center gap-2">
                      <Phone
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">Phone</dt>
                      <dd>{candidate.business_phone}</dd>
                    </div>
                  )}
                </dl>

                {candidate.evidence_notes && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    {candidate.evidence_notes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {candidate.website_url && (
                    <a
                      href={candidate.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Website
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                  {candidate.source_url && (
                    <a
                      href={candidate.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      Evidence source
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                  {candidate.linkedin_url && (
                    <a
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      LinkedIn
                    </a>
                  )}
                  {candidate.instagram_handle && (
                    <a
                      href={`https://instagram.com/${candidate.instagram_handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Instagram
                    </a>
                  )}
                  {candidate.facebook_url && (
                    <a
                      href={candidate.facebook_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Facebook
                    </a>
                  )}
                  {linkedLead && (
                    <Link
                      href={`/dashboard/${workspaceSlug}/leads/${linkedLead.id}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      View {candidate.status === 'imported' ? 'imported' : 'existing'} lead
                    </Link>
                  )}
                </div>

                {candidate.status === 'duplicate' &&
                  candidate.duplicate_of_candidate_id && (
                    <p className="text-xs text-muted-foreground">
                      Matches an earlier candidate in this discovery run.
                    </p>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canImport && readyIds.length > 0 && (
        <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size} of {readyIds.length} ready businesses selected
          </p>
          <Button
            type="button"
            size="lg"
            onClick={importSelected}
            disabled={pending || selected.size === 0}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Importing leads…
              </>
            ) : (
              <>
                <Upload className="size-4" aria-hidden="true" />
                Import selected leads
              </>
            )}
          </Button>
        </div>
      )}

      {!canImport && readyIds.length > 0 && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          AI and lead management permissions are required to import candidates.
        </p>
      )}
    </section>
  );
}
