'use client';

import React from 'react';
import { Workspace } from '@/types/workspace';
import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DynamicBreadcrumbs } from './DynamicBreadcrumbs';
import { Separator } from '@/components/ui/separator';

interface TopbarProps {
  activeWorkspace: Workspace;
}

export function Topbar({ activeWorkspace }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-6 mr-2" />
        <DynamicBreadcrumbs workspaceName={activeWorkspace.name} workspaceSlug={activeWorkspace.slug} />
      </div>
      <div className="flex flex-1 items-center justify-end gap-x-4 lg:gap-x-6">
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full bg-background shadow-none appearance-none pl-8 md:w-2/3 lg:w-full"
          />
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <span className="sr-only">View notifications</span>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}
