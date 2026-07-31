import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project } from '@/types/project';
import { Meeting } from '@/types/meeting';


interface ClientHealthCardProps {
  projects: Project[];
  meetings: Meeting[];
  activities: { created_at: string }[];
}

export function ClientHealthCard({ projects, meetings, activities }: ClientHealthCardProps) {
  const activeProjects = projects.filter(p => ['planning', 'active', 'on_hold'].includes(p.status)).length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;
  
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const meetingsThisMonth = meetings.filter(
    (meeting) => meeting.start_time && new Date(meeting.start_time) >= currentMonthStart
  ).length;

  const lastActivityDate = activities.length > 0 ? new Date(activities[0].created_at) : null;
  const daysSinceLastActivity = lastActivityDate 
    ? Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 3600 * 24))
    : null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium">Health Overview</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Active Projects</p>
          <p className="text-2xl font-bold">{activeProjects}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Completed Projects</p>
          <p className="text-2xl font-bold">{completedProjects}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Meetings (Month)</p>
          <p className="text-2xl font-bold">{meetingsThisMonth}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Last Activity</p>
          <p className="text-2xl font-bold">
            {daysSinceLastActivity === null ? '--' : daysSinceLastActivity === 0 ? 'Today' : `${daysSinceLastActivity}d ago`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
