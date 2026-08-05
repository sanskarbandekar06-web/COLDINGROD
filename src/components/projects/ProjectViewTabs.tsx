'use client';


import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { TasksTable } from '@/components/tasks/TasksTable';
import { ProjectTimeline } from './ProjectTimeline';
import { Project } from '@/types/project';
import { Task } from '@/types/task';
import type { ProjectTimelineActivity } from './ProjectTimeline';
import { LayoutList, Kanban, Clock } from 'lucide-react';

interface ProjectViewTabsProps {
  workspaceId: string;
  workspaceSlug: string;
  project: Project & {
    taskStats?: { total: number, completed: number }
  };
  tasks: (Task & {
    assignee?: { full_name: string, avatar_url: string | null } | null
  })[];
  activities: ProjectTimelineActivity[];
  projects: { id: string, name: string }[];
  members: { id: string, full_name: string }[];
  userId: string;
}

export function ProjectViewTabs({ workspaceId, workspaceSlug, project, tasks, activities, projects, members, userId }: ProjectViewTabsProps) {
  return (
    <Tabs defaultValue="board" className="w-full">
      <div className="flex items-center justify-between mb-4">
        <TabsList>
          <TabsTrigger value="board" className="flex items-center gap-2">
            <Kanban className="h-4 w-4" /> Board
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" /> List
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Timeline
          </TabsTrigger>
        </TabsList>
        
        <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
          Progress: {project.taskStats?.total ? Math.round((project.taskStats.completed / project.taskStats.total) * 100) : 0}% 
          ({project.taskStats?.completed || 0}/{project.taskStats?.total || 0} tasks)
        </div>
      </div>

      <TabsContent value="board" className="mt-0 outline-none">
        <TaskBoard tasks={tasks} workspaceId={workspaceId} />
      </TabsContent>
      
      <TabsContent value="list" className="mt-0 outline-none">
        <TasksTable 
          tasks={tasks}
          totalPages={1}
          currentPage={1}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          projects={projects}
          members={members}
          userId={userId}
          hideProject={true}
          defaultProjectId={project.id}
        />
      </TabsContent>

      <TabsContent value="timeline" className="mt-0 outline-none">
        <div className="max-w-3xl">
          <ProjectTimeline 
            workspaceId={workspaceId} 
            projectId={project.id} 
            activities={activities} 
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
