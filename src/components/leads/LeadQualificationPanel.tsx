'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { runLeadQualificationAction } from '@/actions/lead-qualification';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  LeadQualificationSignals,
  LeadQualificationSnapshot,
  QualificationBand,
  SeoStatus,
  SocialStatus,
  WebsiteStatus,
} from '@/types/lead';

interface LeadQualificationPanelProps {
  workspaceSlug: string;
  leadId: string;
  canRun: boolean;
  latest: LeadQualificationSnapshot | null;
}

const BAND_DETAILS: Record<
  QualificationBand,
  { label: string; className: string }
> = {
  high_priority: {
    label: 'High priority',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  qualified: {
    label: 'Qualified',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  nurture: {
    label: 'Nurture',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  low_opportunity: {
    label: 'Low opportunity',
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
  },
};

const WEBSITE_OPTIONS: { value: WebsiteStatus; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'none', label: 'No website' },
  { value: 'poor', label: 'Poor experience' },
  { value: 'outdated', label: 'Outdated' },
  { value: 'good', label: 'Modern and effective' },
];
const SOCIAL_OPTIONS: { value: SocialStatus; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'missing', label: 'No visible presence' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'active', label: 'Active' },
];
const SEO_OPTIONS: { value: SeoStatus; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'weak', label: 'Weak' },
  { value: 'average', label: 'Average' },
  { value: 'strong', label: 'Strong' },
];
const BOOLEAN_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

function booleanSignal(value: string): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LeadQualificationPanel({
  workspaceSlug,
  leadId,
  canRun,
  latest,
}: LeadQualificationPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [websiteStatus, setWebsiteStatus] = useState<WebsiteStatus>('unknown');
  const [socialStatus, setSocialStatus] = useState<SocialStatus>('unknown');
  const [seoStatus, setSeoStatus] = useState<SeoStatus>('unknown');
  const [googleRating, setGoogleRating] = useState('');
  const [googleReviewCount, setGoogleReviewCount] = useState('');
  const [clearCta, setClearCta] = useState('unknown');
  const [onlineBooking, setOnlineBooking] = useState('unknown');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  const analysis = latest?.factors ?? null;
  const band = analysis
    ? BAND_DETAILS[analysis.qualification_band]
    : BAND_DETAILS.low_opportunity;

  async function runQualification(): Promise<void> {
    const signals: LeadQualificationSignals = {
      websiteStatus,
      socialStatus,
      seoStatus,
      googleRating: googleRating === '' ? null : Number(googleRating),
      googleReviewCount:
        googleReviewCount === '' ? null : Number(googleReviewCount),
      hasClearCta: booleanSignal(clearCta),
      hasOnlineBooking: booleanSignal(onlineBooking),
      evidenceNotes,
    };

    setPending(true);
    try {
      const result = await runLeadQualificationAction({
        workspaceSlug,
        leadId,
        signals,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Lead qualified at ${result.score}/100 with ${result.confidence}% evidence confidence.`,
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('The qualification request could not be completed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {latest ? (
        <>
          <div className="flex flex-col items-center text-center">
            <div
              className="relative flex size-28 items-center justify-center rounded-full border-8 border-secondary/15 bg-secondary/5"
              role="meter"
              aria-label={`Lead service opportunity score ${latest.score} out of 100`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={latest.score}
            >
              <span className="text-4xl font-bold tracking-tight">
                {latest.score}
              </span>
              <span className="absolute bottom-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                of 100
              </span>
            </div>
            <Badge className={`mt-3 border-0 ${band.className}`}>
              {band.label}
            </Badge>
            <p className="mt-2 text-xs text-muted-foreground">
              {analysis?.confidence ?? 0}% evidence confidence
            </p>
          </div>

          {analysis && analysis.opportunities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Best opportunities
              </p>
              <ul className="space-y-2">
                {analysis.opportunities.slice(0, 3).map((opportunity) => (
                  <li key={opportunity} className="flex gap-2 text-sm">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span>{opportunity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latest.ai_action_id && (
            <Link
              href={`/dashboard/${workspaceSlug}/ai/actions/${latest.ai_action_id}`}
              className={buttonVariants({
                variant: 'ghost',
                size: 'sm',
                className: 'w-full',
              })}
            >
              View AI action
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="rounded-xl bg-secondary/10 p-3 text-secondary">
            <Bot className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-3 font-medium">Not qualified yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Use Automatic AI Analysis above. This form is only for manually
            correcting or supplementing evidence.
          </p>
        </div>
      )}

      {canRun ? (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!pending) setOpen(nextOpen);
          }}
        >
          <DialogTrigger render={<Button className="w-full" />}>
            <Sparkles className="size-4" aria-hidden="true" />
            {latest ? 'Adjust evidence manually' : 'Add evidence manually'}
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Lead Qualification Agent</DialogTitle>
              <DialogDescription>
                Optional override: record at least three known signals when you
                want to correct or supplement the automatic public analysis.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void runQualification();
              }}
            >
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="sr-only">Digital presence signals</legend>

                <div className="space-y-2">
                  <Label htmlFor="qualification-website">Website</Label>
                  <Select
                    value={websiteStatus}
                    onValueChange={(value) =>
                      setWebsiteStatus((value as WebsiteStatus | null) ?? 'unknown')
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="qualification-website"
                      className="w-full"
                      aria-label="Website quality"
                    >
                      <SelectValue>
                        {WEBSITE_OPTIONS.find(
                          (option) => option.value === websiteStatus,
                        )?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {WEBSITE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-social">Social presence</Label>
                  <Select
                    value={socialStatus}
                    onValueChange={(value) =>
                      setSocialStatus((value as SocialStatus | null) ?? 'unknown')
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="qualification-social"
                      className="w-full"
                      aria-label="Social presence activity"
                    >
                      <SelectValue>
                        {SOCIAL_OPTIONS.find(
                          (option) => option.value === socialStatus,
                        )?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SOCIAL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-seo">SEO health</Label>
                  <Select
                    value={seoStatus}
                    onValueChange={(value) =>
                      setSeoStatus((value as SeoStatus | null) ?? 'unknown')
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="qualification-seo"
                      className="w-full"
                      aria-label="SEO health"
                    >
                      <SelectValue>
                        {SEO_OPTIONS.find((option) => option.value === seoStatus)
                          ?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SEO_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-rating">
                    Google rating <span className="text-muted-foreground">(0–5)</span>
                  </Label>
                  <Input
                    id="qualification-rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    inputMode="decimal"
                    value={googleRating}
                    onChange={(event) => setGoogleRating(event.target.value)}
                    placeholder="Unknown"
                    disabled={pending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-reviews">Google reviews</Label>
                  <Input
                    id="qualification-reviews"
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    inputMode="numeric"
                    value={googleReviewCount}
                    onChange={(event) => setGoogleReviewCount(event.target.value)}
                    placeholder="Unknown"
                    disabled={pending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-cta">Clear call to action</Label>
                  <Select
                    value={clearCta}
                    onValueChange={(value) => setClearCta(value ?? 'unknown')}
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="qualification-cta"
                      className="w-full"
                      aria-label="Clear call to action available"
                    >
                      <SelectValue>{titleCase(clearCta)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BOOLEAN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualification-booking">Online booking or enquiry</Label>
                  <Select
                    value={onlineBooking}
                    onValueChange={(value) => setOnlineBooking(value ?? 'unknown')}
                    disabled={pending}
                  >
                    <SelectTrigger
                      id="qualification-booking"
                      className="w-full"
                      aria-label="Online booking or enquiry available"
                    >
                      <SelectValue>{titleCase(onlineBooking)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BOOLEAN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="qualification-notes">Evidence notes</Label>
                <Textarea
                  id="qualification-notes"
                  value={evidenceNotes}
                  onChange={(event) => setEvidenceNotes(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Optional: where you observed these signals."
                  disabled={pending}
                  aria-describedby="qualification-notes-count"
                />
                <p
                  id="qualification-notes-count"
                  className="text-right text-xs text-muted-foreground"
                >
                  {evidenceNotes.length}/1000
                </p>
              </div>

              <p className="text-xs text-muted-foreground" aria-live="polite">
                Higher scores represent a stronger opportunity for your agency’s
                services, not a judgment about the business itself.
              </p>

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
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Qualifying…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden="true" />
                      Run qualification
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          AI and lead management permissions are required to run qualification.
        </p>
      )}
    </div>
  );
}
