'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { 
  LayoutDashboard, 
  Target, 
  Users, 
  FolderKanban, 
  CheckSquare, 
  CalendarDays,
  FileBox,
  Bot,
  Blocks,
  Settings,
  LogOut,
  Building,
  UserPlus,
  ShieldAlert,
  UsersRound,
  Cpu,
  ClipboardCheck,
  History,
  Send
} from 'lucide-react';
import { Workspace } from '@/types/workspace';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { logout } from '@/actions/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AppSidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  permissions: string[];
}

export function AppSidebar({ workspaces, activeWorkspace, permissions }: AppSidebarProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/${activeWorkspace.slug}`;

  const hasSettingPerm = permissions.includes('manage_settings');
  const hasMemberPerm = permissions.includes('manage_members');
  // hasAiPerm: AI Center is readable by all workspace members; manage_ai only gates mutations

  const platformNav = [
    { name: 'Dashboard', href: basePath, icon: LayoutDashboard },
    { name: 'Leads', href: `${basePath}/leads`, icon: Target },
    { name: 'Outreach', href: `${basePath}/outreach`, icon: Send },
    { name: 'Clients', href: `${basePath}/clients`, icon: Users },
    { name: 'Projects', href: `${basePath}/projects`, icon: FolderKanban },
    { name: 'Tasks', href: `${basePath}/tasks`, icon: CheckSquare },
    { name: 'Meetings', href: `${basePath}/meetings`, icon: CalendarDays },
    { name: 'Assets', href: `${basePath}/assets`, icon: FileBox },
    { name: 'Integrations', href: `${basePath}/integrations`, icon: Blocks },
  ];

  const aiNav = [
    { name: 'AI Center', href: `${basePath}/ai`, icon: Bot },
    { name: 'Agents', href: `${basePath}/ai/agents`, icon: Cpu },
    { name: 'Approvals', href: `${basePath}/ai/approvals`, icon: ClipboardCheck },
    { name: 'Action History', href: `${basePath}/ai/actions`, icon: History },
  ];

  const managementNav = [
    ...(hasSettingPerm ? [{ name: 'Settings', href: `${basePath}/settings`, icon: Settings }] : []),
    ...((hasSettingPerm && !activeWorkspace.is_personal) ? [{ name: 'Company', href: `${basePath}/settings/company`, icon: Building }] : []),
    ...(hasMemberPerm ? [{ name: 'Members', href: `${basePath}/members`, icon: UsersRound }] : []),
    ...(hasMemberPerm ? [{ name: 'Invites', href: `${basePath}/invites`, icon: UserPlus }] : []),
    ...(hasMemberPerm ? [{ name: 'Permissions', href: `${basePath}/permissions`, icon: ShieldAlert }] : []),
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} />
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNav.map((item) => {
                const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(`${item.href}/`));
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive} tooltip={item.name}>
                        <item.icon />
                        <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* AI Center — visible to all, but approve actions gated by manage_ai */}
        <SidebarGroup>
          <SidebarGroupLabel>AI Center</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {aiNav.map((item) => {
                // Exact-match for the overview; prefix-match for sub-pages (but not cross-contaminating)
                const isActive =
                  pathname === item.href ||
                  (item.href !== basePath &&
                    item.href !== `${basePath}/ai` &&
                    pathname.startsWith(`${item.href}/`)) ||
                  (item.href === `${basePath}/ai` && pathname === `${basePath}/ai`);
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive} tooltip={item.name}>
                        <item.icon />
                        <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {managementNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementNav.map((item) => {
                  const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(`${item.href}/`));
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive} tooltip={item.name}>
                          <item.icon />
                          <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>


      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={`${basePath}/settings`} />} tooltip="Settings">
                <Settings />
                <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">US</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">User</span>
                    <span className="truncate text-xs">user@example.com</span>
                  </div>
                </SidebarMenuButton>
              } />
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuItem render={
                  <form action={logout} className="w-full">
                    <button type="submit" className="w-full flex items-center gap-2 cursor-pointer text-destructive">
                      <LogOut className="h-4 w-4" />
                      <span>Log out</span>
                    </button>
                  </form>
                } />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
