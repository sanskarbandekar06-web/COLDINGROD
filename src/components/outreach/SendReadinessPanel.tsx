import { ReadinessSummary } from '@/services/outreach-readiness.service';
import { CheckCircle, XCircle } from 'lucide-react';

interface SendReadinessPanelProps {
  summary: ReadinessSummary;
}

export function SendReadinessPanel({ summary }: SendReadinessPanelProps) {
  return (
    <section aria-label="Send readiness summary">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">
          Readiness
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            summary.isReady
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}
          aria-label={summary.isReady ? 'Ready for delivery' : 'Not ready'}
        >
          {summary.isReady ? 'Ready for delivery' : 'Not ready'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Derived checks (calculated, not persisted). External delivery is not performed by Coldingrod.
      </p>

      <ul className="space-y-1.5" role="list">
        {summary.checks.map((check, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm"
            role="listitem"
            aria-label={`${check.label}: ${check.passed ? 'passed' : 'failed'}`}
          >
            {check.passed ? (
              <CheckCircle
                className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                className="h-4 w-4 text-rose-500 mt-0.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <div>
              <span className={check.passed ? 'text-foreground' : 'text-muted-foreground'}>
                {check.label}
              </span>
              {check.detail && !check.passed && (
                <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
