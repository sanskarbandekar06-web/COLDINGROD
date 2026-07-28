'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFormStatus } from 'react-dom';
import { addProjectNoteAction } from '@/actions/projects';
import { toast } from 'sonner';
import { FileText, Plus, CheckCircle, Clock } from 'lucide-react';

interface ProjectTimelineProps {
  workspaceId: string;
  projectId: string;
  activities: any[];
}

function SubmitNoteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Add Note'}
    </Button>
  );
}

export function ProjectTimeline({ workspaceId, projectId, activities }: ProjectTimelineProps) {
  const [noteContent, setNoteContent] = useState('');

  const handleAddNote = async (formData: FormData) => {
    const content = formData.get('content') as string;
    if (!content.trim()) return;

    const result = await addProjectNoteAction(workspaceId, projectId, content);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success('Note added');
      setNoteContent('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-lg border">
        <h3 className="text-sm font-medium mb-3">Add a Note</h3>
        <form action={handleAddNote} className="space-y-3">
          <Input 
            name="content"
            placeholder="Write a note about this project..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <div className="flex justify-end">
            <SubmitNoteButton />
          </div>
        </form>
      </div>

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No activities recorded yet.
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border bg-background text-muted-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10">
                {activity.action === 'note' ? (
                  <FileText className="w-4 h-4" />
                ) : activity.action.includes('created') ? (
                  <Plus className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </div>
              
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg border bg-card shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm capitalize">
                    {activity.action.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                
                <div className="text-sm text-muted-foreground mt-2">
                  {activity.action === 'note' && activity.metadata?.content ? (
                    <p className="whitespace-pre-wrap text-foreground">{activity.metadata.content}</p>
                  ) : activity.metadata?.status ? (
                    <p>Status changed to <span className="font-medium text-foreground">{activity.metadata.status}</span></p>
                  ) : (
                    <p>By {activity.actor_user?.full_name || 'System'}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
