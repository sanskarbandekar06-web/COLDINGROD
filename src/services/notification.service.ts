import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { notificationEntityValues } from '@/lib/notification-utils';
import type {
  NotificationActorType,
  NotificationEntityType,
  NotificationItem,
  NotificationPageResult,
  NotificationStats,
  NotificationSummary,
  NotificationView,
} from '@/types/notification';

interface ActivityRow {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_type: 'human' | 'ai_agent' | 'system';
  actor_user_id: string | null;
  actor_agent_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface NotificationRow {
  id: string;
  workspace_id: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  activity: ActivityRow | ActivityRow[] | null;
}

const NOTIFICATION_SELECT = `
  id,
  workspace_id,
  is_read,
  read_at,
  created_at,
  activity:activities!inner(
    id,
    entity_type,
    entity_id,
    actor_type,
    actor_user_id,
    actor_agent_id,
    action,
    metadata,
    created_at
  )
`;

function relationOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function resolveNotificationRows(
  rows: NotificationRow[],
  currentUserId: string,
) {
  const supabase = await createClient();
  const activities = rows
    .map((row) => relationOne(row.activity))
    .filter((activity): activity is ActivityRow => activity !== null);
  const userIds = [
    ...new Set(
      activities
        .map((activity) => activity.actor_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const agentIds = [
    ...new Set(
      activities
        .map((activity) => activity.actor_agent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [usersResult, agentsResult] = await Promise.all([
    userIds.length
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    agentIds.length
      ? supabase.from('ai_agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const userNames = new Map(
    (usersResult.data ?? []).map((user) => [
      user.id,
      user.full_name || user.email || 'Workspace member',
    ]),
  );
  const agentNames = new Map(
    (agentsResult.data ?? []).map((agent) => [agent.id, agent.name]),
  );

  return rows.flatMap((row): NotificationItem[] => {
    const activity = relationOne(row.activity);
    if (!activity) return [];

    let actorName = 'System';
    if (activity.actor_type === 'human' && activity.actor_user_id) {
      actorName =
        activity.actor_user_id === currentUserId
          ? 'You'
          : userNames.get(activity.actor_user_id) || 'Workspace member';
    } else if (activity.actor_type === 'ai_agent' && activity.actor_agent_id) {
      actorName = agentNames.get(activity.actor_agent_id) || 'AI agent';
    }

    return [
      {
        id: row.id,
        workspaceId: row.workspace_id,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
        activity: {
          id: activity.id,
          entityType: activity.entity_type,
          entityId: activity.entity_id,
          actorType: activity.actor_type,
          actorName,
          action: activity.action,
          metadata: activity.metadata,
          createdAt: activity.created_at,
        },
      },
    ];
  });
}

export const getNotificationSummary = cache(
  async (
    workspaceId: string,
    memberId: string,
    currentUserId: string,
  ): Promise<NotificationSummary> => {
    const supabase = await createClient();
    const [recentResult, unreadResult] = await Promise.all([
      supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('workspace_id', workspaceId)
        .eq('workspace_member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('workspace_member_id', memberId)
        .eq('is_read', false),
    ]);

    if (recentResult.error || unreadResult.error) {
      console.error(
        'Error fetching notification summary:',
        recentResult.error ?? unreadResult.error,
      );
      return { unreadCount: 0, recent: [] };
    }

    const recent = await resolveNotificationRows(
      (recentResult.data ?? []) as NotificationRow[],
      currentUserId,
    );
    return { unreadCount: unreadResult.count ?? 0, recent };
  },
);

export const getNotifications = cache(
  async (params: {
    workspaceId: string;
    memberId: string;
    currentUserId: string;
    page: number;
    limit?: number;
    view: NotificationView;
    actor: NotificationActorType;
    entity: NotificationEntityType;
  }): Promise<NotificationPageResult> => {
    const supabase = await createClient();
    const page = Math.max(1, params.page);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const from = (page - 1) * limit;
    const entityValues = notificationEntityValues(params.entity);

    let query = supabase
      .from('notifications')
      .select(NOTIFICATION_SELECT, { count: 'exact' })
      .eq('workspace_id', params.workspaceId)
      .eq('workspace_member_id', params.memberId);

    if (params.view === 'unread') query = query.eq('is_read', false);
    if (params.actor !== 'all') {
      query = query.eq('activity.actor_type', params.actor);
    }
    if (entityValues.length) {
      query = query.in('activity.entity_type', entityValues);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      console.error('Error fetching notifications:', error);
      throw new Error('Failed to fetch notifications');
    }

    return {
      data: await resolveNotificationRows(
        (data ?? []) as NotificationRow[],
        params.currentUserId,
      ),
      count: count ?? 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0,
    };
  },
);

export const getNotificationStats = cache(
  async (
    workspaceId: string,
    memberId: string,
  ): Promise<NotificationStats> => {
    const supabase = await createClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const base = () =>
      supabase
        .from('notifications')
        .select('id, activity:activities!inner(actor_type)', {
          count: 'exact',
          head: true,
        })
        .eq('workspace_id', workspaceId)
        .eq('workspace_member_id', memberId);

    const [total, unread, recent, ai] = await Promise.all([
      base(),
      base().eq('is_read', false),
      base().gte('created_at', since),
      base().eq('activity.actor_type', 'ai_agent'),
    ]);
    const error = total.error ?? unread.error ?? recent.error ?? ai.error;
    if (error) {
      console.error('Error fetching notification statistics:', error);
      return { total: 0, unread: 0, recent24h: 0, aiGenerated: 0 };
    }

    return {
      total: total.count ?? 0,
      unread: unread.count ?? 0,
      recent24h: recent.count ?? 0,
      aiGenerated: ai.count ?? 0,
    };
  },
);