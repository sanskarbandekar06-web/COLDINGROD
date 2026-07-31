'use client';

import type { Activity } from '@/types/lead';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FileText, Bot, User, CheckCircle2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { addNote } from '@/actions/activity';
import { useActionState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ActivityTimeline({
  activities,
  workspaceId,
  leadId
}: {
  activities: Activity[],
  workspaceId: string,
  leadId: string
}) {

  // Note Form State
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(async (_prevState: unknown, formData: FormData) => {
    const content = formData.get('content') as string;
    const res = await addNote(workspaceId, 'lead', leadId, content);
    if (res.success) {
      formRef.current?.reset();
    }
    return res;
  }, null);

  const getIcon = (action: string, actorType: string) => {
    if (action === 'note') return <FileText className="h-4 w-4 text-blue-500" />;
    if (action === 'status_changed') return <RotateCcw className="h-4 w-4 text-amber-500" />;
    if (action === 'lead_created') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (actorType === 'ai_agent') return <Bot className="h-4 w-4 text-purple-500" />;
    return <User className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">

      {/* Note Input */}
      <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border">
        <Avatar className="h-8 w-8 border bg-background">
          <AvatarFallback className="text-xs">Me</AvatarFallback>
        </Avatar>
        <form ref={formRef} action={formAction} className="flex-1 space-y-2">
          <Textarea
            name="content"
            placeholder="Add an internal note..."
            className="min-h-[80px] bg-background resize-none text-sm"
            required
            disabled={isPending}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-destructive">{state?.error}</span>
            <Button size="sm" type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Note'}
            </Button>
          </div>
        </form>
      </div>

      <div className="relative border-l border-muted ml-4 pl-6 space-y-8">
        {activities.map((activity) => (
          <div key={activity.id} className="relative">
            {/* Timeline dot */}
            <div className="absolute -left-9 mt-1.5 h-6 w-6 rounded-full border bg-background flex items-center justify-center shadow-sm">
              {getIcon(activity.action, activity.actor_type)}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {(Array.isArray(activity.actor_user)
                    ? activity.actor_user[0]?.full_name
                    : activity.actor_user?.full_name) ||
                    (activity.actor_type === 'ai_agent' ? 'Coldingrod AI' : 'System')}
                </span>
                <span className="text-muted-foreground">
                  {activity.action === 'note' && 'left a note'}
                  {activity.action === 'status_changed' && 'changed the status'}
                  {activity.action === 'lead_created' && 'created this lead'}
                  {activity.action === 'contact_added' && 'added a contact'}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                </span>
              </div>

              {/* Activity Details / Metadata Content */}
              {activity.action === 'note' && (
                <div className="mt-1 p-3 bg-muted/50 rounded-md border text-sm text-foreground whitespace-pre-wrap">
                  {activity.metadata?.content}
                </div>
              )}

              {activity.action === 'status_changed' && (
                <div className="mt-1">
                  <Badge variant="outline" className="capitalize">{activity.metadata?.new_status?.replace('_', ' ')}</Badge>
                </div>
              )}

              {activity.action === 'contact_added' && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {activity.metadata?.contact_name}
                </div>
              )}
            </div>
          </div>
        ))}

        {activities.length === 0 && (
          <div className="text-sm text-muted-foreground pt-4">No activity history yet.</div>
        )}
      </div>
    </div>
  );
}
