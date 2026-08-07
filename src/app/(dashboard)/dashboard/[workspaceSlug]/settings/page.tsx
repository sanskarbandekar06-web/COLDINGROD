import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BellRing,
  Bot,
  Building2,
  KeyRound,
  MonitorSmartphone,
  Plug,
  Settings2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { WorkspaceSettingsForm } from '@/components/workspace/WorkspaceSettingsForm';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function SettingsPage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await props.params;
  const context = await getWorkspaceContext(workspaceSlug);

  if (!context) notFound();

  const hasPermission = context.permissions.includes('manage_settings');
  const basePath = `/dashboard/${workspaceSlug}`;
  const settingsLinks = [
    { label: 'My profile', href: `${basePath}/settings/profile`, icon: UserRound },
    { label: 'General', href: `${basePath}/settings`, icon: Settings2, active: true },
    ...(!context.workspace.is_personal
      ? [
          { label: 'Company profile', href: `${basePath}/settings/company`, icon: Building2 },
          { label: 'Team management', href: `${basePath}/members`, icon: UsersRound },
          { label: 'Workspace access', href: `${basePath}/permissions`, icon: KeyRound },
        ]
      : []),
    { label: 'Integrations', href: `${basePath}/integrations`, icon: Plug },
    {
      label: 'Browser companion',
      href: `${basePath}/settings/browser-extension`,
      icon: MonitorSmartphone,
    },
    { label: 'AI settings', href: `${basePath}/ai`, icon: Bot },
    { label: 'Notifications', href: `${basePath}/activity`, icon: BellRing },
  ];

  return (
    <div className="space-y-7">
      <div>
        <p className="coldingrod-label mb-2">Administration</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em] text-brand-navy">
          Workspace Settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage workspace identity, access, integrations, and preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="coldingrod-card h-fit p-3">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Preferences
          </p>
          <nav className="space-y-1" aria-label="Workspace settings">
            {settingsLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  item.active
                    ? 'bg-brand-indigo-soft font-semibold text-brand-indigo'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <WorkspaceSettingsForm
          workspace={context.workspace}
          hasPermission={hasPermission}
        />
      </div>
    </div>
  );
}
