import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Meeting } from '@/types/meeting';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function MeetingListMini({ meetings, workspaceSlug }: { meetings: Meeting[], workspaceSlug: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Meetings
        </CardTitle>
        <Link href={`/dashboard/${workspaceSlug}/meetings`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 text-xs' })}>View All</Link>
      </CardHeader>
      <CardContent>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings found.</p>
        ) : (
          <div className="space-y-3">
            {meetings.slice(0, 5).map(m => (
              <div key={m.id} className="flex justify-between items-center text-sm">
                <span className="font-medium truncate mr-2">{m.title}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {m.start_time ? format(new Date(m.start_time), 'MMM d') : 'TBD'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
