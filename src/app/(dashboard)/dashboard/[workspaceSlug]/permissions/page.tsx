import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getAvailablePermissions, getWorkspaceMembers } from '@/services/member.service';
import { getWorkspaceContext } from '@/services/workspace.service';

export default async function PermissionsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context || !context.permissions.includes('manage_members')) notFound();
  if (context.workspace.is_personal) {
    redirect(`/dashboard/${workspaceSlug}/settings/profile`);
  }

  const [permissions, members] = await Promise.all([
    getAvailablePermissions(),
    getWorkspaceMembers(context.workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          title="Workspace Permissions"
          description="Review access capabilities and see who currently holds each permission."
        />
        <Link href={`/dashboard/${workspaceSlug}/members`} className={buttonVariants()}>
          Manage member access
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {permissions.map((permission) => {
          const assigned = members.filter((member) => member.permissions.includes(permission.key));
          return (
            <article key={permission.id} className="coldingrod-card p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-indigo-soft text-brand-indigo">
                  <ShieldCheck className="size-5" />
                </span>
                <Badge variant="outline">{assigned.length} member{assigned.length === 1 ? '' : 's'}</Badge>
              </div>
              <h2 className="mt-4 font-semibold capitalize text-brand-navy">
                {permission.key.replaceAll('_', ' ')}
              </h2>
              <p className="mt-2 min-h-10 text-sm text-muted-foreground">
                {permission.description || 'Workspace capability.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                {assigned.length ? assigned.map((member) => (
                  <span key={member.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {member.user.full_name || member.user.email}
                  </span>
                )) : <span className="text-xs text-muted-foreground">Not assigned</span>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
