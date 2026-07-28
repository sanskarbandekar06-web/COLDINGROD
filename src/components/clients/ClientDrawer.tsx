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

export function ClientDrawer({
  isOpen,
  onClose,
  workspaceId,
  clientId
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  clientId: string | null;
}) {
  const [data, setData] = useState<{ client: any, projects: any[], meetings: any[], activities: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && clientId) {
      setLoading(true);
      getClientDrawerData(workspaceId, clientId).then((res) => {
        setData(res);
        setLoading(false);
      });
    } else {
      setData(null);
    }
  }, [isOpen, clientId, workspaceId]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl flex items-center gap-2">
            {loading ? 'Loading...' : data?.client?.name}
          </SheetTitle>
          <SheetDescription>
            {data?.client?.industry || 'Unknown Industry'}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
            Loading client details...
          </div>
        ) : data?.client ? (
          <div className="mt-6 space-y-6">
            
            {data.client.website && (
              <div className="text-sm">
                <a href={data.client.website.startsWith('http') ? data.client.website : `https://${data.client.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {data.client.website}
                </a>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> Current Projects
              </h4>
              {data.projects.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded p-3 bg-muted/20">No active projects</div>
              ) : (
                <div className="grid gap-2">
                  {data.projects.map((p) => (
                    <div key={p.id} className="text-sm border rounded-lg p-3 bg-card flex justify-between items-center">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">{p.status.replace('_', ' ')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Upcoming Meetings
              </h4>
              {data.meetings.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded p-3 bg-muted/20">No upcoming meetings</div>
              ) : (
                <div className="grid gap-2">
                  {data.meetings.map((m) => (
                    <div key={m.id} className="text-sm border rounded-lg p-3 bg-card flex justify-between items-center">
                      <div className="font-medium truncate mr-2">{m.title}</div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(m.start_time), 'MMM d')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase flex items-center gap-2">
                <ActivityIcon className="h-4 w-4" /> Recent Activities
              </h4>
              {data.activities.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded p-3 bg-muted/20">No recent activity</div>
              ) : (
                <div className="grid gap-2">
                  {data.activities.map((a) => (
                    <div key={a.id} className="text-sm border-l-2 border-primary/50 pl-3 py-1 flex flex-col">
                      <span className="capitalize">{a.action.replace('_', ' ')}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.actor_user ? Array.isArray(a.actor_user) ? a.actor_user[0]?.full_name : (a.actor_user as any)?.full_name : 'System'} • {format(new Date(a.created_at), 'MMM d, p')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t flex flex-col gap-3">
              <Button className="w-full" onClick={() => window.location.href = `/dashboard/${workspaceId}/clients/${clientId}`}>
                View Full Profile <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
