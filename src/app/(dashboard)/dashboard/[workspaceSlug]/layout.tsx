import type { ReactNode } from 'react';
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
  children: ReactNode;
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
    <SidebarProvider
      style={
        {
          '--sidebar-width': '17.5rem',
          '--sidebar-width-icon': '4.25rem',
        } as React.CSSProperties
      }
    >
      <AppSidebar
        workspaces={workspaces}
        activeWorkspace={context.workspace}
        permissions={context.permissions}
        user={context.user}
      />
      <SidebarInset className="min-w-0 bg-brand-canvas">
        <Topbar
          activeWorkspace={context.workspace}
          memberId={context.member.id}
          notificationSummary={notificationSummary}
          user={context.user}
        />
        <main className="flex flex-1 flex-col overflow-y-auto bg-brand-canvas px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div className="mx-auto w-full max-w-[1480px]">{props.children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
