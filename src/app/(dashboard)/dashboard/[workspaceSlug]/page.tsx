import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  FolderKanban,
  Plus,
  Target,
  Users,
} from 'lucide-react';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { Button } from '@/components/ui/button';
import { getRecentActivities } from '@/services/activity.service';
import { getDashboardStats } from '@/services/dashboard.service';
import { getWorkspaceContext } from '@/services/workspace.service';

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="coldingrod-card group flex min-h-44 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-brand-indigo/30 hover:shadow-[var(--floating-shadow)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-blue-soft text-brand-navy">
          <Icon className="size-5" />
        </span>
        <span className="text-base font-medium text-foreground/85">{label}</span>
      </div>
      <div>
        <p className="text-4xl font-bold tracking-[-0.045em]">{value}</p>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          {helper}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  );
}

export default async function DashboardHomePage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await props.params;
  const context = await getWorkspaceContext(workspaceSlug);

  if (!context) redirect('/dashboard');

  const [stats, activities] = await Promise.all([
    getDashboardStats(context.workspace.id),
    getRecentActivities(context.workspace.id, 6, 0),
  ]);

  const basePath = `/dashboard/${workspaceSlug}`;
  const totalRecords =
    stats.totalLeads + stats.totalClients + stats.totalProjects;
  const breakdown = [
    { label: 'Leads', value: stats.totalLeads, color: 'bg-brand-indigo' },
    { label: 'Clients', value: stats.totalClients, color: 'bg-[#3b82f6]' },
    { label: 'Projects', value: stats.totalProjects, color: 'bg-emerald-500' },
  ];
  const displayName =
    context.user.fullName.trim().split(/\s+/)[0] ||
    context.workspace.name;

  const briefing = [
    stats.pendingAiActions > 0
      ? {
          text: `${stats.pendingAiActions} AI action${stats.pendingAiActions === 1 ? '' : 's'} waiting for approval.`,
          href: `${basePath}/ai/approvals`,
          action: 'Review now',
        }
      : {
          text: 'No AI actions are waiting for approval.',
          href: `${basePath}/ai`,
          action: 'Open AI Hub',
        },
    stats.openTasks > 0
      ? {
          text: `${stats.openTasks} open task${stats.openTasks === 1 ? '' : 's'} in this workspace.`,
          href: `${basePath}/tasks`,
          action: 'View tasks',
        }
      : {
          text: 'Your workspace has no open tasks.',
          href: `${basePath}/tasks`,
          action: 'Plan work',
        },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="coldingrod-label mb-2">Agency overview</p>
          <h1 className="text-4xl font-bold tracking-[-0.05em] text-brand-navy sm:text-5xl">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Here&apos;s what is happening in {context.workspace.name}.
          </p>
        </div>
        <Button
          render={<Link href={`${basePath}/leads`} />}
          size="lg"
          className="self-start md:self-auto"
        >
          <Plus className="size-5" />
          New Lead
        </Button>
      </div>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="coldingrod-card flex min-h-[23rem] flex-col p-7 lg:row-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="coldingrod-label">Business pulse</p>
              <h2 className="mt-2 text-2xl font-semibold">Workspace records</h2>
            </div>
            <CheckCircle2 className="size-6 text-emerald-500" />
          </div>
          <div className="mt-10">
            <span className="text-6xl font-bold tracking-[-0.06em]">
              {totalRecords}
            </span>
            <span className="ml-2 text-base text-muted-foreground">live</span>
            <p className="mt-3 text-sm text-emerald-600">
              Synced from your secured workspace
            </p>
          </div>
          <div className="mt-auto">
            <div className="flex h-3 overflow-hidden rounded-full bg-brand-blue-soft">
              {breakdown.map((item) => (
                <span
                  key={item.label}
                  className={item.color}
                  style={{
                    width:
                      totalRecords > 0
                        ? `${Math.max((item.value / totalRecords) * 100, item.value > 0 ? 4 : 0)}%`
                        : '0%',
                  }}
                />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {breakdown.map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <MetricCard
          label="Total Leads"
          value={stats.totalLeads}
          helper="View lead pipeline"
          icon={Target}
          href={`${basePath}/leads`}
        />
        <MetricCard
          label="Active Clients"
          value={stats.totalClients}
          helper="Open client workspace"
          icon={Users}
          href={`${basePath}/clients`}
        />
        <MetricCard
          label="Meetings Today"
          value={stats.meetingsToday}
          helper="View today’s schedule"
          icon={CalendarDays}
          href={`${basePath}/meetings`}
        />
        <MetricCard
          label="Active Projects"
          value={stats.totalProjects}
          helper="Review project work"
          icon={FolderKanban}
          href={`${basePath}/projects`}
        />
      </section>

      <section className="coldingrod-ai-panel rounded-2xl px-6 py-5 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-[auto_1fr_1fr] lg:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-indigo text-white">
              <Bot className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Intelligence Briefing</h2>
                <span className="rounded-full bg-brand-indigo-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-indigo">
                  Live workspace
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Based only on your current data
              </p>
            </div>
          </div>
          {briefing.map((item) => (
            <div key={item.text} className="border-l border-brand-indigo/15 pl-5">
              <p className="text-sm text-foreground/80">{item.text}</p>
              <Link
                href={item.href}
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-indigo hover:underline"
              >
                {item.action} <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="coldingrod-card min-h-[25rem] p-7">
          <div className="mb-7 flex items-center justify-between">
            <div>
              <p className="coldingrod-label">Timeline</p>
              <h2 className="mt-2 text-xl font-semibold">Recent Activity</h2>
            </div>
            <Link
              href={`${basePath}/activity`}
              className="text-xs font-semibold text-brand-indigo hover:underline"
            >
              View all
            </Link>
          </div>
          <ActivityFeed activities={activities} />
        </article>

        <article className="coldingrod-card min-h-[25rem] p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="coldingrod-label">Delivery</p>
              <h2 className="mt-2 text-xl font-semibold">Active Projects</h2>
            </div>
            <FolderKanban className="size-5 text-brand-indigo" />
          </div>
          <div className="mt-10 flex items-end justify-between border-b pb-8">
            <div>
              <p className="text-5xl font-bold tracking-[-0.05em]">
                {stats.totalProjects}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                projects in your workspace
              </p>
            </div>
            <Button
              render={<Link href={`${basePath}/projects`} />}
              variant="outline"
              size="sm"
            >
              View projects
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-4 rounded-xl bg-brand-blue-muted p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-white text-brand-indigo shadow-sm">
              <CheckSquare className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-bold">{stats.openTasks}</p>
              <p className="text-xs text-muted-foreground">open tasks</p>
            </div>
            <Link
              href={`${basePath}/tasks`}
              className="ml-auto text-sm font-semibold text-brand-indigo"
            >
              Review
            </Link>
          </div>
        </article>

        <article className="coldingrod-card min-h-[25rem] p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="coldingrod-label">Today</p>
              <h2 className="mt-2 text-xl font-semibold">Your Schedule</h2>
            </div>
            <span className="rounded-md bg-brand-blue-soft px-2 py-1 text-xs font-bold text-brand-navy">
              {new Intl.DateTimeFormat('en', {
                month: 'short',
                day: 'numeric',
              }).format(new Date())}
            </span>
          </div>
          <div className="mt-12 flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-indigo-soft text-brand-indigo">
              <CalendarDays className="size-7" />
            </span>
            <p className="mt-6 text-5xl font-bold tracking-[-0.05em]">
              {stats.meetingsToday}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {stats.meetingsToday === 1 ? 'meeting scheduled' : 'meetings scheduled'}
            </p>
            <Button
              render={<Link href={`${basePath}/meetings`} />}
              variant="outline"
              className="mt-7 w-full"
            >
              Open meeting workspace
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}
