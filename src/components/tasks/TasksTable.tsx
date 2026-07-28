'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { CreateTaskModal } from './CreateTaskModal';
import { Task } from '@/types/task';
import Link from 'next/link';
import { TaskStatusDropdown } from './TaskStatusDropdown';

interface TasksTableProps {
  tasks: (Task & { 
    project?: { name: string } | null,
    assignee?: { full_name: string, avatar_url: string | null } | null
  })[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  projects: { id: string, name: string }[];
  members: { id: string, full_name: string }[];
  userId: string;
  hideProject?: boolean;
  defaultProjectId?: string;
}

export function TasksTable({ tasks, totalPages, currentPage, workspaceId, projects, members, userId, hideProject, defaultProjectId }: TasksTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  const currentFilter = searchParams.get('assigneeId') || 'all';
  
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput) {
      params.set('search', searchInput);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };
  
  const handleFilterChange = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val !== 'all') {
      params.set('assigneeId', val);
    } else {
      params.delete('assigneeId');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex-1 w-full flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex-1 max-w-sm flex items-center gap-2">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                className="pl-9 bg-background"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </form>
          <select 
            value={currentFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="all">All Tasks</option>
            <option value="me">My Tasks</option>
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> New Task
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              {!hideProject && <TableHead>Project</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={hideProject ? 5 : 6} className="h-24 text-center">
                  No tasks found.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                let dueClass = "text-muted-foreground";
                let dueText = "--";
                
                if (task.due_date) {
                  const date = parseISO(task.due_date);
                  dueText = format(date, 'MMM d, yyyy');
                  
                  if (task.status !== 'completed' && task.status !== 'cancelled') {
                    if (isPast(date) && !isToday(date)) {
                      dueClass = "text-rose-500 font-medium";
                    } else if (isToday(date)) {
                      dueClass = "text-orange-500 font-medium";
                    }
                  }
                }

                return (
                  <TableRow key={task.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {task.title}
                    </TableCell>
                    {!hideProject && (
                      <TableCell className="text-sm text-muted-foreground">
                        {task.project?.name ? (
                          <Link href={`/dashboard/${workspaceId}/projects/${task.project_id}`} className="hover:underline">
                            {task.project.name}
                          </Link>
                        ) : '--'}
                      </TableCell>
                    )}
                    <TableCell>
                      <TaskStatusDropdown 
                        workspaceId={workspaceId} 
                        taskId={task.id} 
                        currentStatus={task.status} 
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.assignee?.full_name || 'Unassigned'}
                    </TableCell>
                    <TableCell className={`text-sm ${dueClass}`}>
                      <div className="flex items-center gap-1.5">
                        {task.due_date && <Calendar className="h-3 w-3" />}
                        {dueText}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(task.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <CreateTaskModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        workspaceId={workspaceId} 
        projects={projects}
        members={members}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
