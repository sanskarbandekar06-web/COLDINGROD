'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BellRing,
  Blocks,
  Bot,
  Building,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Cpu,
  FileBox,
  FolderKanban,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Send,
  Settings,
  ShieldAlert,
  Target,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { logout } from '@/actions/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import type { Workspace } from '@/types/workspace';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface AppSidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  permissions: string[];
  user: {
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || 'User';
  return source
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AppSidebar({
  workspaces,
  activeWorkspace,
  permissions,
  user,
}: AppSidebarProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/${activeWorkspace.slug}`;
  const hasSettingPerm = permissions.includes('manage_settings');
  const hasMemberPerm = permissions.includes('manage_members');

  const primaryNav = [
    { name: 'Dashboard', href: basePath, icon: LayoutDashboard },
    { name: 'Leads', href: `${basePath}/leads`, icon: Target },
    { name: 'Clients', href: `${basePath}/clients`, icon: Users },
    { name: 'Projects', href: `${basePath}/projects`, icon: FolderKanban },
    { name: 'Tasks', href: `${basePath}/tasks`, icon: CheckSquare },
    { name: 'Meetings', href: `${basePath}/meetings`, icon: CalendarDays },
  ];

  const operationsNav = [
    { name: 'Outreach', href: `${basePath}/outreach`, icon: Send },
    { name: 'Assets', href: `${basePath}/assets`, icon: FileBox },
    { name: 'Activity', href: `${basePath}/activity`, icon: BellRing },
    { name: 'Integrations', href: `${basePath}/integrations`, icon: Blocks },
  ];

  const aiNav = [
    { name: 'AI Hub', href: `${basePath}/ai`, icon: Bot },
    { name: 'Agents', href: `${basePath}/ai/agents`, icon: Cpu },
    { name: 'Approvals', href: `${basePath}/ai/approvals`, icon: ClipboardCheck },
    { name: 'Analytics', href: `${basePath}/ai/analytics`, icon: BarChart3 },
    { name: 'Action History', href: `${basePath}/ai/actions`, icon: History },
  ];

  const managementNav = [
    ...(hasSettingPerm
      ? [{ name: 'Settings', href: `${basePath}/settings`, icon: Settings }]
      : []),
    ...(hasSettingPerm && !activeWorkspace.is_personal
      ? [{ name: 'Company', href: `${basePath}/settings/company`, icon: Building }]
      : []),
    ...(hasMemberPerm && !activeWorkspace.is_personal
      ? [{ name: 'Members', href: `${basePath}/members`, icon: UsersRound }]
      : []),
    ...(hasMemberPerm && !activeWorkspace.is_personal
      ? [{ name: 'Invites', href: `${basePath}/invites`, icon: UserPlus }]
      : []),
    ...(hasMemberPerm && !activeWorkspace.is_personal
      ? [{ name: 'Permissions', href: `${basePath}/permissions`, icon: ShieldAlert }]
      : []),
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== basePath && pathname.startsWith(`${href}/`));

  const renderGroup = (
    label: string,
    items: Array<{ name: string; href: string; icon: React.ComponentType<{ className?: string }> }>,
  ) => (
    <SidebarGroup className="px-3 py-2">
      <SidebarGroupLabel className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={isActive(item.href)}
                tooltip={item.name}
                className="h-10 rounded-lg px-3 text-sidebar-foreground/64 transition-colors hover:bg-white/8 hover:text-white data-active:bg-sidebar-primary data-active:text-white data-active:shadow-[0_8px_20px_-10px_rgba(100,94,251,0.9)] [&_svg]:size-[18px]"
              >
                <item.icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-4 px-4 pb-3 pt-5">
        <Link
          href={basePath}
          className="flex items-center gap-3 overflow-hidden px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-lg font-bold text-white shadow-[0_8px_20px_-10px_rgba(100,94,251,0.9)]">
            C
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-[1.35rem] font-bold tracking-[-0.035em] text-white">
              Coldingrod
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Business OS
            </p>
          </div>
        </Link>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
        />
      </SidebarHeader>

      <SidebarContent className="py-1">
        {renderGroup('Workspace', primaryNav)}
        {renderGroup('Operations', operationsNav)}
        {renderGroup('Intelligence', aiNav)}
        {managementNav.length > 0 && renderGroup('Manage', managementNav)}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard/create" />}
              tooltip="New workspace"
              className="h-11 justify-center rounded-lg bg-sidebar-primary px-3 font-semibold text-white hover:bg-[#756fff] hover:text-white"
            >
              <Building />
              <span>New Workspace</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="mx-0 my-2" />

        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={`${basePath}/settings`} />}
              tooltip="Help & settings"
              className="h-9 px-3 text-sidebar-foreground/60 hover:bg-white/8 hover:text-white"
            >
              <HelpCircle />
              <span>Help & settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex items-center gap-1">
            <SidebarMenuButton
              render={<Link href={`${basePath}/settings/profile`} />}
              tooltip="My profile"
              className="h-11 flex-1 px-3 text-sidebar-foreground/60 hover:bg-white/8 hover:text-white"
            >
              <Avatar size="sm" className="size-7 border-0 after:border-white/10">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback className="bg-white/10 text-[10px] font-bold text-white">
                  {initials(user.fullName, user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold text-white">
                  {user.fullName || 'Account'}
                </span>
                <span className="block truncate text-[10px] text-sidebar-foreground/45">
                  Edit personal profile
                </span>
              </span>
            </SidebarMenuButton>
            <form action={logout} className="shrink-0">
              <SidebarMenuButton
                type="submit"
                tooltip="Log out"
                className="size-9 justify-center px-0 text-sidebar-foreground/60 hover:bg-white/8 hover:text-white"
              >
                <LogOut />
                <span className="sr-only">Log out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
