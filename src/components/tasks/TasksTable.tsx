'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { archiveTaskAction, restoreTaskAction } from '@/actions/tasks';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Task } from '@/types/task';
import { CreateTaskModal } from './CreateTaskModal';
import { EditTaskModal } from './EditTaskModal';
import { TaskStatusDropdown } from './TaskStatusDropdown';

interface TasksTableProps {
  tasks: (Task & {
    project?: { name: string } | null;
    assignee?: { full_name: string; avatar_url: string | null } | null;
  })[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  workspaceSlug: string;
  projects: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  hideProject?: boolean;
  defaultProjectId?: string;
  archived?: boolean;
  showArchiveView?: boolean;
}

export function TasksTable({
  tasks,
  totalPages,
  currentPage,
  workspaceId,
  workspaceSlug,
  projects,
  members,
  hideProject = false,
  defaultProjectId,
  archived = false,
  showArchiveView = true,
}: TasksTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  const currentFilter = searchParams.get('assigneeId') || 'all';
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateQuery = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    router.push(`?${params.toString()}`);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateQuery({ search: searchInput.trim() || null, page: '1' });
  };

  const handleArchive = (task: Task) => {
    if (!confirm(`Archive “${task.title}”? You can restore it from Archived tasks.`)) return;
    setBusyTaskId(task.id);
    startTransition(async () => {
      const result = await archiveTaskAction(workspaceId, task.id);
      setBusyTaskId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Task archived');
        router.refresh();
      }
    });
  };

  const handleRestore = (task: Task) => {
    setBusyTaskId(task.id);
    startTransition(async () => {
      const result = await restoreTaskAction(workspaceId, task.id);
      setBusyTaskId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Task restored');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {showArchiveView && (
        <div className="flex items-center gap-2 border-b pb-3">
          <Link href={`/dashboard/${workspaceSlug}/tasks`} className={buttonVariants({ variant: archived ? 'ghost' : 'secondary', size: 'sm' })}>Active</Link>
          <Link href={`/dashboard/${workspaceSlug}/tasks?view=archived`} className={buttonVariants({ variant: archived ? 'secondary' : 'ghost', size: 'sm' })}>Archived</Link>
        </div>
      )}

      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex w-full flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="w-full max-w-sm flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Search tasks…" className="bg-background pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
            </div>
          </form>
          <select
            value={currentFilter}
            onChange={(event) => updateQuery({ assigneeId: event.target.value === 'all' ? null : event.target.value, page: '1' })}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="all">All tasks</option>
            <option value="me">My tasks</option>
          </select>
        </div>
        {!archived && (
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New task
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              {!hideProject && <TableHead>Project</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow><TableCell colSpan={hideProject ? 6 : 7} className="h-24 text-center text-muted-foreground">No {archived ? 'archived ' : ''}tasks found.</TableCell></TableRow>
            ) : tasks.map((task) => {
              let dueClass = 'text-muted-foreground';
              let dueText = '—';
              if (task.due_date) {
                const date = parseISO(task.due_date);
                dueText = format(date, 'MMM d, yyyy');
                if (!archived && task.status !== 'completed' && task.status !== 'cancelled') {
                  if (isPast(date) && !isToday(date)) dueClass = 'font-medium text-destructive';
                  else if (isToday(date)) dueClass = 'font-medium text-orange-600';
                }
              }
              const rowBusy = isPending && busyTaskId === task.id;
              return (
                <TableRow key={task.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{task.title}</TableCell>
                  {!hideProject && <TableCell className="text-sm text-muted-foreground">{task.project?.name && !archived ? <Link href={`/dashboard/${workspaceSlug}/projects/${task.project_id}`} className="hover:underline">{task.project.name}</Link> : task.project?.name || '—'}</TableCell>}
                  <TableCell>{archived ? <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize">{task.status.replace('_', ' ')}</span> : <TaskStatusDropdown workspaceId={workspaceId} taskId={task.id} currentStatus={task.status} />}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{task.assignee?.full_name || 'Unassigned'}</TableCell>
                  <TableCell className={`text-sm ${dueClass}`}><div className="flex items-center gap-1.5">{task.due_date && <Calendar className="h-3 w-3" aria-hidden="true" />}{dueText}</div></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(task.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    {archived ? (
                      <Button variant="ghost" size="sm" disabled={rowBusy} onClick={() => handleRestore(task)}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Restore</Button>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditingTask(task)} aria-label={`Edit ${task.title}`}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" disabled={rowBusy} onClick={() => handleArchive(task)} aria-label={`Archive ${task.title}`} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => updateQuery({ page: String(currentPage - 1) })} disabled={currentPage <= 1}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Previous</Button>
            <Button variant="outline" size="sm" onClick={() => updateQuery({ page: String(currentPage + 1) })} disabled={currentPage >= totalPages}>Next<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button>
          </div>
        </div>
      )}

      {!archived && <CreateTaskModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} workspaceId={workspaceId} projects={projects} members={members} defaultProjectId={defaultProjectId} />}
      {editingTask && <EditTaskModal open={Boolean(editingTask)} onClose={() => setEditingTask(null)} workspaceId={workspaceId} task={editingTask} members={members} />}
    </div>
  );
}
