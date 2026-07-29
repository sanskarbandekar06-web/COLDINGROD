export const NOTIFICATION_ACTOR_FILTERS = [
  'all',
  'human',
  'ai_agent',
  'system',
] as const;

export const NOTIFICATION_ENTITY_FILTERS = [
  'all',
  'lead',
  'client',
  'project',
  'task',
  'meeting',
  'outreach_message',
  'asset',
  'member',
  'ai',
] as const;

export type NotificationActorType =
  (typeof NOTIFICATION_ACTOR_FILTERS)[number];
export type NotificationEntityType =
  (typeof NOTIFICATION_ENTITY_FILTERS)[number];
export type NotificationView = 'all' | 'unread';

export interface NotificationActivity {
  id: string;
  entityType: string;
  entityId: string;
  actorType: Exclude<NotificationActorType, 'all'>;
  actorName: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  workspaceId: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  activity: NotificationActivity;
}

export interface NotificationSummary {
  unreadCount: number;
  recent: NotificationItem[];
}

export interface NotificationStats {
  total: number;
  unread: number;
  recent24h: number;
  aiGenerated: number;
}

export interface NotificationPageResult {
  data: NotificationItem[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationActionResult {
  success: boolean;
  error?: string;
}
