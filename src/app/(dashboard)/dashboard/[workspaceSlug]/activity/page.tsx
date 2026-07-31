import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActivityCenter } from '@/components/notifications/ActivityCenter';
import {
  getNotifications,
  getNotificationStats,
} from '@/services/notification.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import {
  NOTIFICATION_ACTOR_FILTERS,
  NOTIFICATION_ENTITY_FILTERS,
  type NotificationActorType,
  type NotificationEntityType,
  type NotificationView,
} from '@/types/notification';

export const metadata: Metadata = {
  title: 'Activity Center | Coldingrod',
  description: 'Review workspace activity and manage notification read status.',
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function validActor(value: string): NotificationActorType {
  return NOTIFICATION_ACTOR_FILTERS.find((option) => option === value) ?? 'all';
}

function validEntity(value: string): NotificationEntityType {
  return NOTIFICATION_ENTITY_FILTERS.find((option) => option === value) ?? 'all';
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const requestedPage = Number.parseInt(firstValue(query.page), 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const view: NotificationView =
    firstValue(query.view) === 'unread' ? 'unread' : 'all';
  const actor = validActor(firstValue(query.actor));
  const entity = validEntity(firstValue(query.entity));

  const [result, stats] = await Promise.all([
    getNotifications({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      currentUserId: context.user.id,
      page,
      view,
      actor,
      entity,
    }),
    getNotificationStats(context.workspace.id, context.member.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="coldingrod-label mb-2">Reports</p>
        <h1 className="text-4xl font-bold tracking-[-0.045em] text-brand-navy">
          Activity Center
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Follow important workspace changes, team actions and AI events in one
          place. Read status is private to your account.
        </p>
      </div>

      <ActivityCenter
        workspaceSlug={workspaceSlug}
        result={result}
        stats={stats}
        view={view}
        actor={actor}
        entity={entity}
      />
    </div>
  );
}