'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { runLeadDiscoveryAction } from '@/actions/lead-discovery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LeadDiscoveryCandidateInput } from '@/types/lead-discovery';

interface CandidateDraft extends LeadDiscoveryCandidateInput {
  key: string;
}

const EMPTY_CANDIDATE: LeadDiscoveryCandidateInput = {
  companyName: '',
  websiteUrl: '',
  industry: '',
  location: '',
  sourceUrl: '',
  businessEmail: '',
  businessPhone: '',
  evidenceNotes: '',
  externalReference: '',
};

function createCandidate(
  key: string,
  initial?: Partial<LeadDiscoveryCandidateInput>,
): CandidateDraft {
  return {
    ...EMPTY_CANDIDATE,
    ...initial,
    key,
  };
}

function candidateInput(candidate: CandidateDraft): LeadDiscoveryCandidateInput {
  return {
    companyName: candidate.companyName,
    websiteUrl: candidate.websiteUrl,
    industry: candidate.industry,
    location: candidate.location,
    sourceUrl: candidate.sourceUrl,
    businessEmail: candidate.businessEmail,
    businessPhone: candidate.businessPhone,
    evidenceNotes: candidate.evidenceNotes,
    externalReference: candidate.externalReference,
  };
}

export function LeadDiscoveryForm({
  workspaceSlug,
  initialRunName = '',
  initialCandidate,
}: {
  workspaceSlug: string;
  initialRunName?: string;
  initialCandidate?: Partial<LeadDiscoveryCandidateInput>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextCandidateKey = useRef(2);
  const [runName, setRunName] = useState(initialRunName);
  const [market, setMarket] = useState('');
  const [location, setLocation] = useState('');
  const [serviceFocus, setServiceFocus] = useState('');
  const [notes, setNotes] = useState('');
  const [candidates, setCandidates] = useState<CandidateDraft[]>(() => [
    createCandidate('candidate-1', initialCandidate),
  ]);

  function updateCandidate(
    key: string,
    field: keyof LeadDiscoveryCandidateInput,
    value: string,
  ) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.key === key ? { ...candidate, [field]: value } : candidate,
      ),
    );
  }

  function removeCandidate(key: string) {
    setCandidates((current) =>
      current.length === 1
        ? current
        : current.filter((candidate) => candidate.key !== key),
    );
  }

  const usesGooglePlaces = candidates.every(
    (candidate) => candidate.externalReference.trim().length > 0,
  );

  function submitDiscovery() {
    startTransition(async () => {
      const result = await runLeadDiscoveryAction({
        workspaceSlug,
        brief: {
          runName,
          market,
          location,
          serviceFocus,
          notes,
        },
        candidates: candidates.map(candidateInput),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Discovery complete: ${result.readyCount} ready, ${result.duplicateCount} duplicate.`,
      );
      router.push(
        `/dashboard/${workspaceSlug}/leads/discovery/${result.runId}`,
      );
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        submitDiscovery();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4 text-primary" aria-hidden="true" />
            Search brief
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe the market once, then add only businesses you actually
            observed. Empty candidate locations inherit the target location.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="discovery-name">Discovery name</Label>
            <Input
              id="discovery-name"
              value={runName}
              onChange={(event) => setRunName(event.target.value)}
              minLength={2}
              maxLength={160}
              required
              placeholder="Pune dental studios"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discovery-market">Market or industry</Label>
            <Input
              id="discovery-market"
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              maxLength={160}
              placeholder="Dental clinics"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discovery-location">Target location</Label>
            <Input
              id="discovery-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={240}
              placeholder="Pune, Maharashtra"
              disabled={pending}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="discovery-service">Service opportunity</Label>
            <Input
              id="discovery-service"
              value={serviceFocus}
              onChange={(event) => setServiceFocus(event.target.value)}
              maxLength={240}
              placeholder="Website redesign and local SEO"
              disabled={pending}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="discovery-notes">Brief notes</Label>
            <Textarea
              id="discovery-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional search boundaries or evidence standards."
              disabled={pending}
              aria-describedby="discovery-notes-count"
            />
            <p
              id="discovery-notes-count"
              className="text-right text-xs text-muted-foreground"
            >
              {notes.length}/1000
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="observed-businesses">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="observed-businesses" className="text-lg font-semibold">
              Observed businesses
            </h2>
            <p className="text-sm text-muted-foreground">
              The agent validates and deduplicates up to 50 supplied candidates.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setCandidates((current) => [
                ...current,
                createCandidate('candidate-' + nextCandidateKey.current++),
              ])
            }
            disabled={pending || candidates.length >= 50}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add business
          </Button>
        </div>

        <div className="space-y-4">
          {candidates.map((candidate, index) => {
            const prefix = `discovery-candidate-${candidate.key}`;
            return (
              <Card key={candidate.key}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    Business candidate
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCandidate(candidate.key)}
                    disabled={pending || candidates.length === 1}
                    aria-label={`Remove business ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`${prefix}-name`}>Company name</Label>
                    <Input
                      id={`${prefix}-name`}
                      value={candidate.companyName}
                      onChange={(event) =>
                        updateCandidate(
                          candidate.key,
                          'companyName',
                          event.target.value,
                        )
                      }
                      minLength={2}
                      maxLength={160}
                      required
                      placeholder="Fresh Growth Studio"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${prefix}-website`}>Website</Label>
                    <Input
                      id={`${prefix}-website`}
                      type="url"
                      value={candidate.websiteUrl}
                      onChange={(event) =>
                        updateCandidate(
                          candidate.key,
                          'websiteUrl',
                          event.target.value,
                        )
                      }
                      maxLength={500}
                      placeholder="https://example.com"
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${prefix}-industry`}>Industry</Label>
                    <Input
                      id={`${prefix}-industry`}
                      value={candidate.industry}
                      onChange={(event) =>
                        updateCandidate(
                          candidate.key,
                          'industry',
                          event.target.value,
                        )
                      }
                      maxLength={160}
                      placeholder={market || 'Dental'}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${prefix}-location`}>Location</Label>
                    <Input
                      id={`${prefix}-location`}
                      value={candidate.location}
                      onChange={(event) =>
                        updateCandidate(
                          candidate.key,
                          'location',
                          event.target.value,
                        )
                      }
                      maxLength={240}
                      placeholder={location || 'City, region'}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${prefix}-email`}>Business email</Label>
                    <Input
                      id={`${prefix}-email`}
                      type="email"
                      value={candidate.businessEmail}
                      onChange={(event) =>
                        updateCandidate(
                          candidate.key,
                          'businessEmail',
                          event.target.value,
                        )
                      }
                      maxLength={320}
                      placeholder="hello@example.com"
                      disabled={pending}
                    />
                  </div>
                  <details className="sm:col-span-2">
                    <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Add phone, source evidence, or Google Place ID
                    </summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`${prefix}-phone`}>Business phone</Label>
                        <Input
                          id={`${prefix}-phone`}
                          type="tel"
                          value={candidate.businessPhone}
                          onChange={(event) =>
                            updateCandidate(
                              candidate.key,
                              'businessPhone',
                              event.target.value,
                            )
                          }
                          maxLength={80}
                          placeholder="+91 90000 00000"
                          disabled={pending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${prefix}-source`}>Source URL</Label>
                        <Input
                          id={`${prefix}-source`}
                          type="url"
                          value={candidate.sourceUrl}
                          onChange={(event) =>
                            updateCandidate(
                              candidate.key,
                              'sourceUrl',
                              event.target.value,
                            )
                          }
                          maxLength={500}
                          placeholder="https://directory.example/listing"
                          disabled={pending}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`${prefix}-place-id`}>
                          Google Place ID
                        </Label>
                        <Input
                          id={`${prefix}-place-id`}
                          value={candidate.externalReference}
                          onChange={(event) =>
                            updateCandidate(
                              candidate.key,
                              'externalReference',
                              event.target.value,
                            )
                          }
                          maxLength={255}
                          placeholder="Paste the permitted Place ID from search"
                          disabled={pending}
                        />
                        <p className="text-xs text-muted-foreground">
                          If one candidate uses a Place ID, every candidate in
                          this run must use one. Other Google Places content is
                          not saved automatically.
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`${prefix}-evidence`}>
                          Evidence notes
                        </Label>
                        <Textarea
                          id={`${prefix}-evidence`}
                          value={candidate.evidenceNotes}
                          onChange={(event) =>
                            updateCandidate(
                              candidate.key,
                              'evidenceNotes',
                              event.target.value,
                            )
                          }
                          maxLength={1000}
                          rows={3}
                          placeholder="What you observed and where."
                          disabled={pending}
                        />
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="size-4" aria-hidden="true" />
          {candidates.length} of 50 businesses supplied
          {usesGooglePlaces ? ' · Google Places references' : ' · Manual intake'}
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Validating candidates…
            </>
          ) : (
            <>
              <Search className="size-4" aria-hidden="true" />
              {usesGooglePlaces
                ? 'Run Google Places Discovery'
                : 'Run Lead Discovery'}
            </>
          )}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? 'Lead Discovery Agent is validating candidates.' : ''}
      </p>
    </form>
  );
}
