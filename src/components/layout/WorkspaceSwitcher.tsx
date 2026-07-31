'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Building, User } from 'lucide-react';
import { Workspace } from '@/types/workspace';
import { setLastActiveWorkspace } from '@/actions/workspace-preference';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
}

export function WorkspaceSwitcher({ workspaces, activeWorkspace }: WorkspaceSwitcherProps) {
  const router = useRouter();

  const onWorkspaceSelect = (workspace: Workspace) => {
    void setLastActiveWorkspace(workspace.slug).finally(() => {
      router.push(`/dashboard/${workspace.slug}`);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm w-full justify-between h-12 px-3 hover:bg-accent/50 group">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background">
            {activeWorkspace.is_personal ? <User className="h-4 w-4" /> : <Building className="h-4 w-4" />}
          </div>
          <div className="flex flex-col items-start overflow-hidden text-sm">
            <span className="font-medium truncate max-w-[140px] text-foreground">
              {activeWorkspace.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {activeWorkspace.is_personal ? 'Personal' : 'Team'}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Personal Account</DropdownMenuLabel>
        {workspaces.filter(w => w.is_personal).map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => onWorkspaceSelect(workspace)}
            className="flex items-center gap-3 cursor-pointer p-2"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-sm border bg-background">
               <User className="h-3 w-3" />
            </div>
            <span className="flex-1 truncate">{workspace.name}</span>
            {activeWorkspace.id === workspace.id && (
              <Check className="ml-auto h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>Teams</DropdownMenuLabel>
        {workspaces.filter(w => !w.is_personal).map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => onWorkspaceSelect(workspace)}
            className="flex items-center gap-3 cursor-pointer p-2"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-sm border bg-background">
               <Building className="h-3 w-3" />
            </div>
            <span className="flex-1 truncate">{workspace.name}</span>
            {activeWorkspace.id === workspace.id && (
              <Check className="ml-auto h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={() => router.push('/dashboard/create')}
          className="flex items-center gap-3 cursor-pointer p-2 text-primary"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-primary/20 bg-primary/10">
            <Building className="h-3 w-3" />
          </div>
          <span className="flex-1 font-medium">Create New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
