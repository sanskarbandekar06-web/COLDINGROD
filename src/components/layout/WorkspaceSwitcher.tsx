'use client';

import { Building, Check, ChevronsUpDown, User } from 'lucide-react';
import Link from 'next/link';
import { setLastActiveWorkspace } from '@/actions/workspace-preference';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Workspace } from '@/types/workspace';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
}: WorkspaceSwitcherProps) {
  const onWorkspaceSelect = (workspace: Workspace) => {
    void setLastActiveWorkspace(workspace.slug).catch(() => {
      // Navigation must not depend on saving this optional preference.
    });
  };

  const workspaceRow = (workspace: Workspace) => (
    <DropdownMenuItem
      key={workspace.id}
      render={<Link href={`/dashboard/${workspace.slug}`} />}
      onClick={() => onWorkspaceSelect(workspace)}
      aria-current={activeWorkspace.id === workspace.id ? 'page' : undefined}
      className="flex cursor-pointer items-center gap-3 p-2.5"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-brand-blue-soft text-brand-navy">
        {workspace.is_personal ? (
          <User className="size-3.5" />
        ) : (
          <Building className="size-3.5" />
        )}
      </span>
      <span className="flex-1 truncate">{workspace.name}</span>
      {activeWorkspace.id === workspace.id && (
        <Check className="size-4 text-brand-indigo" />
      )}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex h-11 w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 text-left text-sidebar-foreground outline-none transition hover:bg-white/9 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
            {activeWorkspace.is_personal ? (
              <User className="size-3.5" />
            ) : (
              <Building className="size-3.5" />
            )}
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-xs font-semibold text-white">
              {activeWorkspace.name}
            </span>
            <span className="block text-[10px] text-sidebar-foreground/45">
              {activeWorkspace.is_personal ? 'Personal' : 'Team workspace'}
            </span>
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Personal workspace</DropdownMenuLabel>
          {workspaces.filter((workspace) => workspace.is_personal).map(workspaceRow)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Team workspaces</DropdownMenuLabel>
          {workspaces.filter((workspace) => !workspace.is_personal).map(workspaceRow)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/dashboard/create" />}
          className="flex cursor-pointer items-center gap-3 p-2.5 text-brand-indigo"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-brand-indigo-soft">
            <Building className="size-3.5" />
          </span>
          <span className="font-semibold">Create new workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
