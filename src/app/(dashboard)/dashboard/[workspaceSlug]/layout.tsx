import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Topbar } from '@/components/layout/Topbar';
import { getWorkspaceContext, getUserWorkspaces } from '@/services/workspace.service';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

export default async function DashboardWorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);

  if (!context) {
    // This catches either a missing workspace or missing membership (404/unauthorized)
    redirect('/dashboard');
  }

  const { workspace } = context;

  // We fetch all workspaces for the switcher
  const workspaces = await getUserWorkspaces();

  return (
    <SidebarProvider>
      <AppSidebar workspaces={workspaces} activeWorkspace={workspace} permissions={context.permissions} />
      <SidebarInset>
        <Topbar activeWorkspace={workspace} />
        <main className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
          {props.children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
