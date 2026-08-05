import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bot, BriefcaseBusiness, KeyRound, MessageSquare, SlidersHorizontal, UserRound } from 'lucide-react';
import { ProfilePreferencesForm } from '@/components/profile/ProfilePreferencesForm';
import { getWorkspaceContext } from '@/services/workspace.service';
import { createClient } from '@/lib/supabase/server';

export default async function ProfileSettingsPage({ params }) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, full_name, avatar_url, avatar_path, job_title, timezone, locale, email_notifications, product_updates, ai_assistance_enabled')
    .eq('id', context.user.id)
    .single();
  if (error || !profile) notFound();

  const sections = [
    { label: 'Overview', href: '#overview', icon: UserRound },
    { label: 'Personal Preferences', href: '#preferences', icon: SlidersHorizontal },
    { label: 'AI Preferences', href: '#communication', icon: Bot },
    { label: 'Communication', href: '#communication', icon: MessageSquare },
    { label: 'Personal Workspace', href: `/dashboard/${workspaceSlug}/settings`, icon: BriefcaseBusiness },
    { label: 'Security', href: '/forgot-password', icon: KeyRound },
  ];

  return (
    <div className="space-y-7">
      <div>
        <p className="coldingrod-label mb-2">Your account</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em] text-brand-navy">Profile Settings</h1>
        <p className="mt-2 text-muted-foreground">Edit your personal identity and preferences across every workspace.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="coldingrod-card h-fit p-3 lg:sticky lg:top-24">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Profile Settings</p>
          <nav className="space-y-1" aria-label="Profile settings">
            {sections.map((item, index) => (
              <Link key={item.label} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${index === 0 ? 'bg-brand-indigo-soft font-semibold text-brand-indigo' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <ProfilePreferencesForm profile={profile} workspaceSlug={workspaceSlug} />
      </div>
    </div>
  );
}