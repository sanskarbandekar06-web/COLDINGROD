'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  BellRing,
  Bot,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileBox,
  FolderKanban,
  Inbox,
  Mail,
  MailOpen,
  Target,
  User,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  markAllNotificationsReadAction,
  setNotificationReadAction,
} from '@/actions/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NOTIFICATION_ACTOR_LABELS,
  NOTIFICATION_ENTITY_LABELS,
  notificationHref,
  notificationMessage,
} from '@/lib/notification-utils';
import { cn } from '@/lib/utils';
import type {
  NotificationActorType,
  NotificationEntityType,
  NotificationPageResult,
  NotificationStats,
  NotificationView,
} from '@/types/notification';

function EntityIcon({ entityType }: { entityType: string }) {
  const className = 'size-5';
  if (entityType.includes('lead')) return <Target className={className} />;
  if (entityType.includes('client')) return <Users className={className} />;
  if (entityType.includes('project')) return <FolderKanban className={className} />;
  if (entityType.includes('asset')) return <FileBox className={className} />;
  if (entityType.includes('ai')) return <Bot className={className} />;
  return <User className={className} />;
}

export function ActivityCenter({
  workspaceSlug,
  result,
  stats,
  view,
  actor,
  entity,
}: {
  workspaceSlug: string;
  result: NotificationPageResult;
  stats: NotificationStats;
  view: NotificationView;
  actor: NotificationActorType;
  entity: NotificationEntityType;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateParam(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`);
  }

  function setRead(notificationId: string, isRead: boolean) {
    startTransition(async () => {
      const result = await setNotificationReadAction(
        workspaceSlug,
        notificationId,
        isRead,
      );
      if (!result.success) toast.error(result.error);
      else router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction(workspaceSlug);
      if (!result.success) toast.error(result.error);
      else {
        toast.success('All notifications marked as read.');
        router.refresh();
      }
    });
  }

  const metrics = [
    { label: 'Unread', value: stats.unread, icon: Mail },
    { label: 'All activity', value: stats.total, icon: BellRing },
    { label: 'Last 24 hours', value: stats.recent24h, icon: Clock3 },
    { label: 'AI activity', value: stats.aiGenerated, icon: Bot },
  ];
  const hasFilters = view !== 'all' || actor !== 'all' || entity !== 'all';

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tracking-tight">
                  {value.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-lg bg-muted p-1">
          <Button
            type="button"
            size="sm"
            variant={view === 'all' ? 'secondary' : 'ghost'}
            onClick={() => updateParam('view')}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'unread' ? 'secondary' : 'ghost'}
            onClick={() => updateParam('view', 'unread')}
          >
            Unread
            {stats.unread > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stats.unread}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={entity}
            onValueChange={(value) =>
              updateParam('entity', value === 'all' ? undefined : value ?? undefined)
            }
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by area">
              <SelectValue>{NOTIFICATION_ENTITY_LABELS[entity]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NOTIFICATION_ENTITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={actor}
            onValueChange={(value) =>
              updateParam('actor', value === 'all' ? undefined : value ?? undefined)
            }
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by actor">
              <SelectValue>{NOTIFICATION_ACTOR_LABELS[actor]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NOTIFICATION_ACTOR_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {stats.unread > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={markAllRead}
              disabled={pending}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          )}

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('?')}
            >
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {result.data.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-6 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-base font-semibold">
              {hasFilters ? 'No matching activity' : 'No activity yet'}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {hasFilters
                ? 'Try another filter or clear the current view.'
                : 'Workspace updates and AI events will appear here automatically.'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {result.data.map((notification) => {
              const { activity } = notification;
              const href = notificationHref(
                workspaceSlug,
                activity.entityType,
                activity.entityId,
              );
              return (
                <article
                  key={notification.id}
                  className={cn(
                    'group flex gap-3 p-4 transition-colors sm:gap-4 sm:p-5',
                    !notification.isRead && 'bg-primary/[0.04]',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
                      !notification.isRead && 'bg-primary/10 text-primary',
                    )}
                  >
                    <EntityIcon entityType={activity.entityType} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <Link
                        href={href}
                        onClick={(event) => {
                          if (!notification.isRead) {
                            event.preventDefault();
                            startTransition(async () => {
                              await setNotificationReadAction(
                                workspaceSlug,
                                notification.id,
                                true,
                              );
                              router.push(href);
                            });
                          }
                        }}
                        className="rounded-sm text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-semibold">{activity.actorName}</span>{' '}
                        <span className="text-muted-foreground">
                          {notificationMessage(
                            activity.action,
                            activity.entityType,
                            activity.metadata,
                          )}
                        </span>
                      </Link>
                      <time
                        dateTime={activity.createdAt}
                        title={format(new Date(activity.createdAt), 'PPpp')}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      </time>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {activity.entityType.replaceAll('_', ' ')}
                      </Badge>
                      <Badge variant="secondary">
                        {activity.actorType === 'ai_agent'
                          ? 'AI agent'
                          : activity.actorType === 'human'
                            ? 'Person'
                            : 'System'}
                      </Badge>
                      {!notification.isRead && (
                        <Badge>Unread</Badge>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => setRead(notification.id, !notification.isRead)}
                    aria-label={notification.isRead ? 'Mark unread' : 'Mark read'}
                    title={notification.isRead ? 'Mark unread' : 'Mark read'}
                    className="shrink-0"
                  >
                    {notification.isRead ? (
                      <MailOpen className="size-4" />
                    ) : (
                      <Check className="size-4" />
                    )}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {result.count === 0
            ? '0 notifications'
            : `${(result.page - 1) * result.limit + 1}–${Math.min(
                result.page * result.limit,
                result.count,
              )} of ${result.count} notifications`}
        </p>
        {result.totalPages > 1 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(result.page - 1)}
              disabled={result.page <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(result.page + 1)}
              disabled={result.page >= result.totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}