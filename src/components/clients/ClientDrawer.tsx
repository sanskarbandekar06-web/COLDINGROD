'use client';

import { useEffect, useState } from 'react';
import { getClientDrawerData } from '@/actions/client-drawer';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ExternalLink, Calendar, Briefcase, Activity as ActivityIcon } from 'lucide-react';
import { format } from 'date-fns';

type ClientDrawerData = Awaited<ReturnType<typeof getClientDrawerData>>;

type DrawerState = {
  clientId: string;
  data: ClientDrawerData | null;
  error: boolean;
};

function getActorName(
  value: { full_name: string | null } | { full_name: string | null }[] | null,
): string {
  const actor = Array.isArray(value) ? value[0] : value;
  return actor?.full_name ?? 'System';
}

export function ClientDrawer({
  isOpen,
  onClose,
  workspaceId,
  workspaceSlug,
  clientId,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceSlug: string;
  clientId: string | null;
}) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

  useEffect(() => {
    if (!isOpen || !clientId) return;

    let cancelled = false;
    void getClientDrawerData(workspaceId, clientId)
      .then((result) => {
        if (!cancelled) {
          setDrawerState({ clientId, data: result, error: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDrawerState({ clientId, data: null, error: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId, workspaceId]);

  const activeState = drawerState?.clientId === clientId ? drawerState : null;
  const data = activeState?.data ?? null;
  const loading = Boolean(isOpen && clientId && !activeState);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-xl">
            {loading ? 'Loading...' : data?.client?.name ?? 'Client details'}
          </SheetTitle>
          <SheetDescription>
            {data?.client?.industry || 'Unknown industry'}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="animate-pulse py-8 text-center text-sm text-muted-foreground">
            Loading client details...
          </div>
        ) : activeState?.error ? (
          <div className="py-8 text-center text-sm text-destructive">
            Client details could not be loaded. Close the panel and try again.
          </div>
        ) : data?.client ? (
          <div className="mt-6 space-y-6">
            {data.client.website && (
              <div className="text-sm">
                <a
                  href={
                    data.client.website.startsWith('http')
                      ? data.client.website
                      : `https://${data.client.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {data.client.website}
                </a>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium uppercase text-muted-foreground">
                <Briefcase className="h-4 w-4" /> Current Projects
              </h4>
              {data.projects.length === 0 ? (
                <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No active projects
                </div>
              ) : (
                <div className="grid gap-2">
                  {data.projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm"
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {project.status.replace('_', ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium uppercase text-muted-foreground">
                <Calendar className="h-4 w-4" /> Upcoming Meetings
              </h4>
              {data.meetings.length === 0 ? (
                <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No upcoming meetings
                </div>
              ) : (
                <div className="grid gap-2">
                  {data.meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm"
                    >
                      <div className="mr-2 truncate font-medium">{meeting.title}</div>
                      <div className="whitespace-nowrap text-xs text-muted-foreground">
                        {meeting.start_time
                          ? format(new Date(meeting.start_time), 'MMM d')
                          : 'Unscheduled'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-medium uppercase text-muted-foreground">
                <ActivityIcon className="h-4 w-4" /> Recent Activities
              </h4>
              {data.activities.length === 0 ? (
                <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No recent activity
                </div>
              ) : (
                <div className="grid gap-2">
                  {data.activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex flex-col border-l-2 border-primary/50 py-1 pl-3 text-sm"
                    >
                      <span className="capitalize">{activity.action.replace('_', ' ')}</span>
                      <span className="text-xs text-muted-foreground">
                        {getActorName(activity.actor_user)} •{' '}
                        {format(new Date(activity.created_at), 'MMM d, p')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t pt-6">
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = `/dashboard/${workspaceSlug}/clients/${clientId}`;
                }}
              >
                View Full Profile <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
