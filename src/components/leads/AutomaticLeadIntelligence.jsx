'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { prepareAutomaticLeadIntelligenceAction } from '@/actions/automatic-lead-intelligence';
import { Button } from '@/components/ui/button';

export function AutomaticLeadIntelligence({
  workspaceSlug,
  leadId,
  canRun,
  isReady,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(async () => {
      const result = await prepareAutomaticLeadIntelligenceAction(
        workspaceSlug,
        leadId,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `AI analysis complete: ${result.score}/100 opportunity score, ${result.opportunityCount} outreach basis${result.opportunityCount === 1 ? '' : 'es'}, ${result.contactCount} contact profile${result.contactCount === 1 ? '' : 's'}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4">
        <div className="flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold">
              {isReady ? 'AI lead intelligence is ready' : 'Let the agents prepare this lead'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Coldingrod aggregates the imported source, verified website,
              contact/about pages, structured business data, and existing
              destinations. It then creates the Opportunity Score, Executive
              Summary, and Detailed Analysis automatically.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-background/80 p-3 text-xs text-muted-foreground">
          {isReady ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
          )}
          Unknown facts stay unknown; the agents do not invent ratings, reviews,
          private contacts, or performance claims.
        </div>
      </div>

      {canRun ? (
        <Button className="w-full" onClick={analyze} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {pending
            ? 'Researching and qualifying…'
            : isReady
              ? 'Refresh automatic analysis'
              : 'Analyze and qualify automatically'}
        </Button>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          AI and lead management permissions are required to run this analysis.
        </p>
      )}
    </div>
  );
}
