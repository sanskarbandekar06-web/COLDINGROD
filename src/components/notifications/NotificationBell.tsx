'use client';

import { useEffect, useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  Bot,
  CheckCheck,
  FileBox,
  FolderKanban,
  Inbox,
  Target,
  User,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  markAllNotificationsReadAction,
  setNotificationReadAction,
} from '@/actions/notifications';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createClient } from '@/lib/supabase/client';
import {
  notificationHref,
  notificationMessage,
} from '@/lib/notification-utils';
import { cn } from '@/lib/utils';
import type { NotificationSummary } from '@/types/notification';

function NotificationIcon({ entityType }: { entityType: string }) {
  const className = 'size-4';
  if (entityType.includes('lead')) return <Target className={className} />;
  if (entityType.includes('client')) return <Users className={className} />;
  if (entityType.includes('project')) return <FolderKanban className={className} />;
  if (entityType.includes('asset')) return <FileBox className={className} />;
  if (entityType.includes('ai')) return <Bot className={className} />;
  return <User className={className} />;
}

export function NotificationBell({
  workspaceSlug,
  memberId,
  summary,
}: {
  workspaceSlug: string;
  memberId: string;
  summary: NotificationSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${memberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_member_id=eq.${memberId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [memberId, router]);

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction(workspaceSlug);
      if (!result.success) toast.error(result.error);
      else router.refresh();
    });
  }

  function openNotification(notificationId: string, isRead: boolean, href: string) {
    startTransition(async () => {
      if (!isRead) {
        const result = await setNotificationReadAction(
          workspaceSlug,
          notificationId,
          true,
        );
        if (!result.success) toast.error(result.error);
      }
      router.push(href);
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
            aria-label={`Notifications${summary.unreadCount ? `, ${summary.unreadCount} unread` : ''}`}
          />
        }
      >
        <Bell className="size-5" aria-hidden="true" />
        {summary.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <PopoverHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <div>
            <PopoverTitle className="text-base">Notifications</PopoverTitle>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summary.unreadCount
                ? `${summary.unreadCount} unread in this workspace`
                : 'You are all caught up'}
            </p>
          </div>
          {summary.unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              disabled={pending}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          )}
        </PopoverHeader>

        {summary.recent.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-3 font-medium">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New workspace activity will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="divide-y">
              {summary.recent.map((notification) => {
                const { activity } = notification;
                const href = notificationHref(
                  workspaceSlug,
                  activity.entityType,
                  activity.entityId,
                  activity.action,
                );
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      openNotification(notification.id, notification.isRead, href)
                    }
                    disabled={pending}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      !notification.isRead && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
                        !notification.isRead && 'bg-primary/10 text-primary',
                      )}
                    >
                      <NotificationIcon entityType={activity.entityType} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5">
                        <span className="font-medium">{activity.actorName}</span>{' '}
                        <span className="text-muted-foreground">
                          {notificationMessage(
                            activity.action,
                            activity.entityType,
                            activity.metadata,
                          )}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    {!notification.isRead && (
                      <span
                        className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push(`/dashboard/${workspaceSlug}/activity`);
            }}
          >
            View activity center
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
