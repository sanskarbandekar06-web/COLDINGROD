import React from 'react';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Topbar } from '@/components/layout/Topbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getNotificationSummary } from '@/services/notification.service';
import {
  getUserWorkspaces,
  getWorkspaceContext,
} from '@/services/workspace.service';

export default async function DashboardWorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);

  if (!context) redirect('/dashboard');

  const [workspaces, notificationSummary] = await Promise.all([
    getUserWorkspaces(),
    getNotificationSummary(
      context.workspace.id,
      context.member.id,
      context.user.id,
    ),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        workspaces={workspaces}
        activeWorkspace={context.workspace}
        permissions={context.permissions}
      />
      <SidebarInset>
        <Topbar
          activeWorkspace={context.workspace}
          memberId={context.member.id}
          notificationSummary={notificationSummary}
        />
        <main className="flex flex-1 flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          {props.children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}