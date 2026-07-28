import { Activity } from '@/types/dashboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { User, Bot, Server } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Activity as ActivityIcon } from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities || activities.length === 0) {
    return (
      <EmptyState 
        icon={ActivityIcon}
        title="No recent activity"
        description="When things happen in your workspace, they will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {activities.map((activity, index) => (
        <div key={activity.id} className="relative flex gap-4">
          {index !== activities.length - 1 && (
            <div className="absolute left-4 top-10 bottom-[-24px] w-px bg-border" />
          )}
          
          <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background shrink-0">
            {activity.actor_type === 'human' && <User className="h-4 w-4 text-muted-foreground" />}
            {activity.actor_type === 'ai_agent' && <Bot className="h-4 w-4 text-indigo-500" />}
            {activity.actor_type === 'system' && <Server className="h-4 w-4 text-slate-500" />}
          </div>

          <div className="flex flex-col pt-1.5">
            <p className="text-sm">
              <span className="font-medium text-foreground">{activity.actor_name || 'System'}</span>
              <span className="text-muted-foreground"> {activity.action} </span>
              <span className="font-medium text-foreground">{activity.entity_type}</span>
            </p>
            <span className="text-xs text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
