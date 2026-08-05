'use server';

import { createClient } from '@/lib/supabase/server';

export interface MemberWorkspaceOverview {
  activities: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
  assignments: Array<{
    id: string;
    kind: 'Lead' | 'Project' | 'Task';
    title: string;
    status: string;
  }>;
}

export async function getMemberWorkspaceOverviewAction(
  workspaceId: string,
  targetUserId: string,
): Promise<{ data?: MemberWorkspaceOverview; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to view member activity.' };

  const [{ data: actor }, { data: target }] = await Promise.all([
    supabase.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
    supabase.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', targetUserId).is('deleted_at', null).maybeSingle(),
  ]);
  if (!actor || !target) return { error: 'Active workspace membership is required.' };

  const [activities, leads, projects, tasks] = await Promise.all([
    supabase.from('activities').select('id, action, entity_type, created_at').eq('workspace_id', workspaceId).eq('actor_user_id', targetUserId).order('created_at', { ascending: false }).limit(15),
    supabase.from('leads').select('id, company_name, status').eq('workspace_id', workspaceId).eq('assigned_to', targetUserId).is('deleted_at', null).limit(10),
    supabase.from('projects').select('id, name, status').eq('workspace_id', workspaceId).eq('owner_id', targetUserId).is('deleted_at', null).limit(10),
    supabase.from('tasks').select('id, title, status').eq('workspace_id', workspaceId).eq('assigned_to', targetUserId).is('deleted_at', null).limit(10),
  ]);
  const firstError = [activities, leads, projects, tasks].find((result) => result.error)?.error;
  if (firstError) {
    console.error('Member workspace overview error:', firstError);
    return { error: 'Member activity could not be loaded.' };
  }

  return {
    data: {
      activities: (activities.data ?? []).map((row) => ({ id: row.id, action: row.action, entityType: row.entity_type, createdAt: row.created_at })),
      assignments: [
        ...(leads.data ?? []).map((row) => ({ id: row.id, kind: 'Lead' as const, title: row.company_name, status: row.status })),
        ...(projects.data ?? []).map((row) => ({ id: row.id, kind: 'Project' as const, title: row.name, status: row.status })),
        ...(tasks.data ?? []).map((row) => ({ id: row.id, kind: 'Task' as const, title: row.title, status: row.status })),
      ],
    },
  };
}
