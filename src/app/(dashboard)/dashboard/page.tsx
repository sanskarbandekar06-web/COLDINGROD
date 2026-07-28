import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserWorkspaces } from '@/services/workspace.service';

export default async function DashboardRoot() {
  const workspaces = await getUserWorkspaces();

  if (!workspaces || workspaces.length === 0) {
    // If no workspaces, they might be in the middle of signup, or there's an error.
    // In our system, the DB trigger automatically creates a personal workspace.
    // So this shouldn't happen under normal circumstances.
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">No workspaces found</h1>
        <p className="text-muted-foreground mt-2">
          Your account does not belong to any workspaces.
        </p>
      </div>
    );
  }

  // 1. Try to get last active from cookie
  const cookieStore = await cookies();
  const lastActiveSlug = cookieStore.get('last_active_workspace_slug')?.value;

  if (lastActiveSlug) {
    const hasAccess = workspaces.some((ws) => ws.slug === lastActiveSlug);
    if (hasAccess) {
      redirect(`/dashboard/${lastActiveSlug}`);
    }
  }

  // 2. Fallback to Personal Workspace
  const personalWorkspace = workspaces.find((ws) => ws.is_personal);
  if (personalWorkspace) {
    redirect(`/dashboard/${personalWorkspace.slug}`);
  }

  // 3. Fallback to the first available workspace
  redirect(`/dashboard/${workspaces[0].slug}`);
}
