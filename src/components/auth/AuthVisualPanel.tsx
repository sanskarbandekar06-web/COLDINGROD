import {
  Bot,
  Building2,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

function MiniDashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="absolute -right-8 -bottom-10 hidden h-52 w-72 rotate-6 overflow-hidden rounded-2xl border border-white/70 bg-white/82 p-3 shadow-2xl backdrop-blur-xl xl:block"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-8 items-center gap-2 border-b border-slate-200 px-2.5">
          <div className="size-2 rounded-full bg-brand-indigo" />
          <div className="h-1.5 w-12 rounded bg-slate-200" />
        </div>
        <div className="grid flex-1 grid-cols-[42px_1fr]">
          <div className="border-r border-slate-200 bg-brand-navy p-2">
            <div className="mb-2 size-4 rounded bg-brand-indigo" />
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="mb-2 h-1.5 rounded bg-white/20" />
            ))}
          </div>
          <div className="space-y-2 bg-brand-canvas p-3">
            <div className="h-3 w-24 rounded bg-slate-300" />
            <div className="grid grid-cols-3 gap-2">
              {[60, 78, 45].map((height) => (
                <div key={height} className="h-10 rounded border border-slate-200 bg-white p-1.5">
                  <div className="mb-1 h-1 w-6 rounded bg-slate-200" />
                  <div className="h-2 w-4 rounded bg-brand-navy" />
                </div>
              ))}
            </div>
            <div className="flex h-14 items-end gap-1 rounded border border-slate-200 bg-white px-2 pb-2">
              {[30, 48, 68, 52, 78, 64].map((height) => (
                <div
                  key={height}
                  className="flex-1 rounded-t-sm bg-brand-indigo-soft"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthVisualPanel() {
  return (
    <section className="relative hidden min-h-svh overflow-hidden bg-[#e5eeff] lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:p-12">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute left-[12%] top-[18%] size-80 rounded-full bg-[#c3c0ff]/55 blur-3xl" />
        <div className="absolute bottom-[12%] right-[10%] size-96 rounded-full bg-[#bec6e0]/60 blur-3xl" />
        <div className="coldingrod-dot-grid absolute inset-0 opacity-35" />
      </div>

      <div className="relative z-10 grid w-full max-w-2xl grid-cols-12 gap-3">
        <article className="coldingrod-card col-span-8 flex min-h-44 flex-col justify-between p-6">
          <div className="flex items-start justify-between">
            <span className="coldingrod-label">System efficacy</span>
            <TrendingUp className="size-5 text-brand-indigo" />
          </div>
          <div>
            <p className="text-5xl font-bold tracking-[-0.04em] text-brand-navy">99.9%</p>
            <p className="mt-2 text-sm text-slate-600">Operational integrity maintained</p>
          </div>
        </article>

        <article className="relative col-span-4 flex min-h-44 overflow-hidden rounded-2xl bg-[#070510] p-6 text-white shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-indigo/35 to-transparent" />
          <div className="relative flex flex-col justify-between">
            <Bot className="size-8" />
            <div>
              <p className="text-lg font-semibold">Active</p>
              <p className="mt-1 text-xs text-[#c3c0ff]">AI Assistant ready</p>
            </div>
          </div>
        </article>

        <article className="coldingrod-card col-span-6 flex h-52 flex-col p-6">
          <span className="coldingrod-label">Throughput</span>
          <div className="mt-6 flex flex-1 items-end gap-2 px-2">
            {[32, 48, 72, 60, 42].map((height, index) => (
              <div
                key={height}
                className={index === 2 ? 'relative flex-1 rounded-t bg-brand-indigo-soft' : 'flex-1 rounded-t bg-[#d3e4fe]'}
                style={{ height: `${height}%` }}
              >
                {index === 2 && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-brand-navy px-2 py-1 text-[10px] font-semibold text-white">
                    Peak
                  </span>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="coldingrod-card relative col-span-6 h-52 p-6">
          <span className="coldingrod-label">Operations</span>
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#e5eeff]">
                <RefreshCw className="size-4 text-brand-navy" />
              </div>
              <div>
                <p className="text-sm font-semibold">Data sync complete</p>
                <p className="text-xs text-slate-500">Just now</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-emerald-50">
                <ShieldCheck className="size-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Security checks passed</p>
                <p className="text-xs text-slate-500">Workspace protected</p>
              </div>
            </div>
          </div>
          <MiniDashboardPreview />
        </article>
      </div>
    </section>
  );
}

export function ColdingrodBrandMark({
  inverse = false,
  className = '',
}: {
  inverse?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex size-12 items-center justify-center rounded-xl shadow-md ${
        inverse ? 'bg-white text-brand-navy' : 'bg-black text-white'
      } ${className}`}
    >
      <Building2 className="size-6" aria-hidden="true" />
      <span className="sr-only">Coldingrod</span>
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.19 3.3v2.76h3.56c2.08-1.92 3.27-4.73 3.27-8.07Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.68l-3.56-2.76c-.99.67-2.25 1.07-3.73 1.07-2.87 0-5.3-1.94-6.16-4.53H2.17v2.84C4.01 20.6 7.68 23 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.65 6.65 0 0 1 5.5 12c0-.74.12-1.44.34-2.1V7.06H2.17A11 11 0 0 0 1 12c0 1.76.41 3.42 1.17 4.94l3.67-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.17-3.17C17.45 2.06 14.97 1 12 1 7.68 1 4.01 3.4 2.17 7.06L5.84 9.9C6.7 7.31 9.13 5.38 12 5.38Z" />
    </svg>
  );
}

export function AuthTrustNote() {
  return (
    <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
      <CheckCircle2 className="size-3.5 text-emerald-600" />
      <span>Protected by workspace-level security</span>
    </div>
  );
}
