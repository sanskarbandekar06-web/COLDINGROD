import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { Activity as ActivityIcon } from 'lucide-react';

export function ClientTimeline({ activities }: { activities: any[] }) {
  return (
    <Card className="h-full border-0 shadow-none sm:border sm:shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ActivityIcon className="h-5 w-5 text-muted-foreground" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No activities recorded yet.
          </div>
        ) : (
          <div className="relative border-l border-muted ml-3 space-y-6">
            {activities.map((activity, index) => {
              const date = new Date(activity.created_at);
              const actorName = activity.actor_user 
                ? (Array.isArray(activity.actor_user) ? activity.actor_user[0]?.full_name : (activity.actor_user as any)?.full_name) 
                : 'System';

              return (
                <div key={activity.id} className="relative pl-6">
                  {/* Timeline dot */}
                  <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />
                  
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium capitalize">
                      {activity.action.replace(/_/g, ' ')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(date, 'MMM d, yyyy - h:mm a')}</span>
                      <span>•</span>
                      <span>{actorName}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
