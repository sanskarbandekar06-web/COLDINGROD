import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { FileSearch, FileText, Link2 } from 'lucide-react';
import { getWorkspaceContext } from '@/services/workspace.service';
import { getLeadDetails } from '@/services/lead.service';
import { getLeadResearchHistory } from '@/services/lead-research.service';
import { Badge } from '@/components/ui/badge';
import { ReportActions } from '@/components/leads/ReportActions';

const SUMMARY_FIELDS = [
  ['offerings', 'Offerings'],
  ['target_audience', 'Target audience'],
  ['differentiators', 'Differentiators'],
  ['recent_activity', 'Recent activity'],
  ['observed_challenges', 'Observed challenges'],
  ['evidence_notes', 'Evidence notes'],
];

function SummaryReport({ report }) {
  const fields = SUMMARY_FIELDS.filter(([key]) => report.research_summary[key]);
  return (
    <div className="space-y-6">
      <section aria-labelledby="summary-overview" className="rounded-2xl border bg-muted/25 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="summary-overview" className="text-sm font-semibold">Research confidence</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Based on {report.evidence_field_count} verified evidence fields and {report.source_count} public sources.
            </p>
          </div>
          <p className="text-3xl font-bold text-primary">{report.confidence}%</p>
        </div>
      </section>

      <section aria-labelledby="summary-findings" className="space-y-4">
        <h2 id="summary-findings" className="text-xl font-semibold">Business summary</h2>
        {fields.length ? fields.map(([key, label]) => (
          <div key={key} className="border-l-2 border-primary/40 pl-4">
            <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
            <p className="mt-1 leading-7">{report.research_summary[key]}</p>
          </div>
        )) : (
          <p className="text-muted-foreground">No verified summary fields were stored.</p>
        )}
      </section>

      <section aria-labelledby="summary-opportunities" className="space-y-3">
        <h2 id="summary-opportunities" className="text-xl font-semibold">Priority opportunities</h2>
        {report.pain_points.slice(0, 3).map((point) => (
          <article key={point.key} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{point.label}</h3>
              <Badge variant="outline">{point.priority} priority</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{point.impact}</p>
            <p className="mt-3 text-sm font-medium text-primary">Recommended: {point.service_opportunity}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function DetailedReport({ report }) {
  return (
    <div className="space-y-7">
      <section aria-labelledby="analysis-method" className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confidence</p>
          <p className="mt-2 text-2xl font-bold">{report.confidence}%</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence fields</p>
          <p className="mt-2 text-2xl font-bold">{report.evidence_field_count}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Public sources</p>
          <p className="mt-2 text-2xl font-bold">{report.source_count}</p>
        </div>
      </section>

      <section aria-labelledby="analysis-findings" className="space-y-4">
        <h2 id="analysis-findings" className="text-xl font-semibold">Detailed opportunity analysis</h2>
        {report.pain_points.length ? report.pain_points.map((point, index) => (
          <article key={point.key} className="break-inside-avoid rounded-2xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finding {index + 1}</p>
                <h3 className="mt-1 text-lg font-semibold">{point.label}</h3>
              </div>
              <Badge variant="outline">{point.priority} · {point.points} points</Badge>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Evidence</dt>
                <dd className="mt-1 text-muted-foreground">{point.evidence}</dd>
              </div>
              <div>
                <dt className="font-semibold">Business impact</dt>
                <dd className="mt-1 text-muted-foreground">{point.impact}</dd>
              </div>
              <div className="rounded-lg bg-primary/5 p-3">
                <dt className="font-semibold text-primary">Service opportunity</dt>
                <dd className="mt-1">{point.service_opportunity}</dd>
              </div>
            </dl>
          </article>
        )) : (
          <p className="text-muted-foreground">No positive opportunity factors were identified.</p>
        )}
      </section>

      <section aria-labelledby="analysis-sources" className="space-y-3">
        <h2 id="analysis-sources" className="text-xl font-semibold">Evidence sources</h2>
        {report.source_urls.length ? (
          <ol className="space-y-2">
            {report.source_urls.map((source) => (
              <li key={source} className="flex items-start gap-2 break-all text-sm">
                <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a href={source} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">{source}</a>
              </li>
            ))}
          </ol>
        ) : <p className="text-muted-foreground">No external source URLs were stored.</p>}
      </section>
    </div>
  );
}

export default async function LeadReportPage({ params }) {
  const { workspaceSlug, leadId, reportType } = await params;
  if (!['summary', 'detailed'].includes(reportType)) notFound();

  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();
  const [lead, reports] = await Promise.all([
    getLeadDetails(context.workspace.id, leadId),
    getLeadResearchHistory(context.workspace.id, leadId, 1),
  ]);
  const report = reports[0];
  if (!lead || !report) notFound();

  const isSummary = reportType === 'summary';
  const title = isSummary ? 'Executive Summary' : 'Detailed Analysis Report';
  const backHref = `/dashboard/${workspaceSlug}/leads/${leadId}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <ReportActions backHref={backHref} />
      <article className="print:fixed print:inset-0 print:z-[9999] print:overflow-visible print:bg-white print:p-10 print:text-black">
        <header className="border-b pb-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-primary">
                {isSummary ? <FileText className="size-5" aria-hidden="true" /> : <FileSearch className="size-5" aria-hidden="true" />}
                <p className="text-sm font-semibold uppercase tracking-[0.16em]">Coldingrod</p>
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
              <p className="mt-2 text-lg text-muted-foreground">{lead.company_name}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Generated from verified research</p>
              <time dateTime={report.created_at}>{format(new Date(report.created_at), 'PPP')}</time>
            </div>
          </div>
        </header>
        <div className="mt-7">
          {isSummary ? <SummaryReport report={report} /> : <DetailedReport report={report} />}
        </div>
        <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Evidence-based report. Unknown information is intentionally not invented.
        </footer>
      </article>
    </div>
  );
}
