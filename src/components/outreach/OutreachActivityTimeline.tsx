import { Activity } from '@/types/lead';
import { formatDistanceToNow } from 'date-fns';
import { Bot, User, Settings } from 'lucide-react';

interface OutreachActivityTimelineProps {
  activities: Activity[];
}

const actionLabels: Record<string, string> = {
  message_draft_created: 'Draft created',
  message_content_edited: 'Content edited',
  message_archived: 'Message archived',
  message_restored: 'Message restored',
  approval_granted: 'Approval granted',
  approval_rejected: 'Approval rejected',
};

export function OutreachActivityTimeline({ activities }: OutreachActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-5" aria-label="Activity timeline">
      {activities.map((activity) => {
        const label = actionLabels[activity.action] ?? activity.action;
        const ActorIcon =
          activity.actor_type === 'ai_agent'
            ? Bot
            : activity.actor_type === 'system'
            ? Settings
            : User;

        return (
          <li key={activity.id} className="ml-4">
            <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-background bg-muted-foreground/40" aria-hidden="true" />
            <div className="flex items-start gap-2">
              <ActorIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <time
                  dateTime={activity.created_at}
                  className="text-xs text-muted-foreground"
                >
                  {formatDistanceToNow(new Date(activity.created_at), {
                    addSuffix: true,
                  })}
                </time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
