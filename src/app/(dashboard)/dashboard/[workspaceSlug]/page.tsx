import React from 'react';
import { getWorkspaceContext } from '@/services/workspace.service';
import { getDashboardStats } from '@/services/dashboard.service';
import { getRecentActivities } from '@/services/activity.service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { MetricGrid } from '@/components/dashboard/MetricGrid';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { SectionCard } from '@/components/dashboard/SectionCard';
import { 
  Users, 
  Target, 
  FolderKanban, 
  CheckSquare, 
  CalendarDays,
  Bot
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default async function DashboardHomePage(props: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  
  if (!context) {
    redirect('/dashboard');
  }

  const workspaceId = context.workspace.id;

  // Fetch data in parallel
  const [stats, activities] = await Promise.all([
    getDashboardStats(workspaceId),
    getRecentActivities(workspaceId, 10, 0)
  ]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Dashboard" 
        description={`Welcome back to ${context.workspace.name}. Here's what's happening today.`} 
        action={
          <Button>New Action</Button>
        }
      />

      <MetricGrid>
        <StatCard 
          title="Total Leads" 
          value={stats.totalLeads} 
          icon={Target} 
          description="Total qualified leads" 
        />
        <StatCard 
          title="Total Clients" 
          value={stats.totalClients} 
          icon={Users} 
          description="Active client accounts" 
        />
        <StatCard 
          title="Active Projects" 
          value={stats.totalProjects} 
          icon={FolderKanban} 
          description="Projects currently in progress" 
        />
        <StatCard 
          title="Open Tasks" 
          value={stats.openTasks} 
          icon={CheckSquare} 
          description="Tasks requiring attention" 
        />
        <StatCard 
          title="Meetings Today" 
          value={stats.meetingsToday} 
          icon={CalendarDays} 
          description="Scheduled for today" 
        />
        <StatCard 
          title="Pending AI Actions" 
          value={stats.pendingAiActions} 
          icon={Bot} 
          description="Awaiting approval" 
        />
      </MetricGrid>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="md:col-span-1 lg:col-span-4 space-y-6">
          {/* Main content area for charts or larger modules in the future */}
          <SectionCard title="Recent Activity" description="Latest actions performed in this workspace">
            <ActivityFeed activities={activities} />
          </SectionCard>
        </div>
        
        <div className="md:col-span-1 lg:col-span-3 space-y-6">
          {/* Sidebar area for smaller lists, e.g. upcoming meetings */}
          <SectionCard title="Upcoming Meetings" description="Your schedule for the next few days">
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No upcoming meetings.
            </div>
          </SectionCard>
          
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="w-full justify-start h-12">Add Lead</Button>
              <Button variant="outline" className="w-full justify-start h-12">New Project</Button>
              <Button variant="outline" className="w-full justify-start h-12">Schedule Meeting</Button>
              <Button variant="outline" className="w-full justify-start h-12">Run AI Agent</Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
