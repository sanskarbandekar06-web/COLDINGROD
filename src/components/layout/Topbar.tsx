'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { DynamicBreadcrumbs } from './DynamicBreadcrumbs';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { NotificationSummary } from '@/types/notification';
import type { Workspace } from '@/types/workspace';

export function Topbar({
  activeWorkspace,
  memberId,
  notificationSummary,
}: {
  activeWorkspace: Workspace;
  memberId: string;
  notificationSummary: NotificationSummary;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <DynamicBreadcrumbs
          workspaceName={activeWorkspace.name}
          workspaceSlug={activeWorkspace.slug}
        />
      </div>
      <div className="flex flex-1 items-center justify-end gap-x-4 lg:gap-x-6">
        <div className="relative hidden w-full max-w-md sm:block">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            aria-label="Search workspace"
            className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-full"
          />
        </div>
        <NotificationBell
          workspaceSlug={activeWorkspace.slug}
          memberId={memberId}
          summary={notificationSummary}
        />
      </div>
    </header>
  );
}