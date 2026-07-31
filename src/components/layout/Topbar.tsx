'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Search } from 'lucide-react';
import { DynamicBreadcrumbs } from './DynamicBreadcrumbs';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { NotificationSummary } from '@/types/notification';
import type { Workspace } from '@/types/workspace';

export function Topbar({
  activeWorkspace,
  memberId,
  notificationSummary,
  user,
}: {
  activeWorkspace: Workspace;
  memberId: string;
  notificationSummary: NotificationSummary;
  user: { email: string; fullName: string };
}) {
  const pathname = usePathname();
  const basePath = `/dashboard/${activeWorkspace.slug}`;
  const onOverview = pathname === basePath;
  const onReports = pathname.startsWith(`${basePath}/activity`);
  const moduleName = pathname.startsWith(`${basePath}/leads`)
    ? 'Leads'
    : pathname.startsWith(`${basePath}/clients`)
      ? 'Clients'
      : pathname.startsWith(`${basePath}/meetings`)
        ? 'Meetings'
        : 'Analytics';
  const moduleHref =
    moduleName === 'Leads'
      ? `${basePath}/leads`
      : moduleName === 'Clients'
        ? `${basePath}/clients`
        : moduleName === 'Meetings'
          ? `${basePath}/meetings`
          : `${basePath}/ai/analytics`;
  const onModule = !onOverview && !onReports;
  const initials = (user.fullName || user.email || 'User')
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-border/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <nav className="hidden h-16 items-center gap-8 md:flex" aria-label="Workspace views">
          <Link
            href={basePath}
            className={`flex h-full items-center border-b-2 px-0.5 text-sm font-semibold transition-colors ${
              onOverview
                ? 'border-brand-indigo text-brand-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview
          </Link>
          <Link
            href={moduleHref}
            className={`flex h-full items-center border-b-2 px-0.5 text-sm font-medium transition-colors ${
              onModule
                ? 'border-brand-indigo text-brand-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {moduleName}
          </Link>
          <Link
            href={`${basePath}/activity`}
            className={`flex h-full items-center border-b-2 px-0.5 text-sm font-medium transition-colors ${
              onReports
                ? 'border-brand-indigo text-brand-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Reports
          </Link>
        </nav>
        <div className="min-w-0 md:hidden">
          <DynamicBreadcrumbs
            workspaceName={activeWorkspace.name}
            workspaceSlug={activeWorkspace.slug}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button
          render={<Link href={`${basePath}/ai`} />}
          variant="secondary"
          size="sm"
          className="hidden rounded-full bg-brand-indigo-soft text-brand-indigo shadow-none hover:bg-[#d6d2ff] sm:inline-flex"
        >
          <Bot className="size-4" />
          AI Assistant
        </Button>
        <span className="mx-2 hidden h-8 w-px bg-border sm:block" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Search workspace"
          title="Search workspace"
        >
          <Search className="size-5" />
        </Button>
        <NotificationBell
          workspaceSlug={activeWorkspace.slug}
          memberId={memberId}
          summary={notificationSummary}
        />
        <div
          className="ml-1 flex size-9 items-center justify-center rounded-full border-2 border-white bg-brand-navy text-xs font-bold text-white shadow-sm"
          aria-label={user.fullName || user.email}
          title={user.fullName || user.email}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
