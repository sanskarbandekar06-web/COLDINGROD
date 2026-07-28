'use client';

import { Task, TaskStatus } from '@/types/task';
import { TaskStatusDropdown } from './TaskStatusDropdown';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';

interface TaskBoardProps {
  tasks: (Task & {
    assignee?: { full_name: string, avatar_url: string | null } | null
  })[];
  workspaceId: string;
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'completed', title: 'Completed' },
  { id: 'cancelled', title: 'Cancelled' },
];

export function TaskBoard({ tasks, workspaceId }: TaskBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-2 snap-x">
      {COLUMNS.map(column => {
        const columnTasks = tasks.filter(t => t.status === column.id);
        
        return (
          <div key={column.id} className="min-w-[300px] w-[300px] flex-shrink-0 bg-muted/30 rounded-lg p-3 snap-start">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-semibold text-sm">{column.title}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {columnTasks.length}
              </span>
            </div>
            
            <div className="space-y-3">
              {columnTasks.map(task => {
                let dueClass = "text-muted-foreground";
                let dueText = "--";
                
                if (task.due_date) {
                  const date = parseISO(task.due_date);
                  dueText = format(date, 'MMM d');
                  
                  if (task.status !== 'completed' && task.status !== 'cancelled') {
                    if (isPast(date) && !isToday(date)) {
                      dueClass = "text-rose-500 font-medium";
                    } else if (isToday(date)) {
                      dueClass = "text-orange-500 font-medium";
                    }
                  }
                }

                return (
                  <div key={task.id} className="bg-card border rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="font-medium text-sm mb-2">{task.title}</h4>
                    
                    <div className="flex items-center justify-between mt-4">
                      <TaskStatusDropdown 
                        workspaceId={workspaceId}
                        taskId={task.id}
                        currentStatus={task.status}
                      />
                      
                      {task.due_date && (
                        <div className={`flex items-center gap-1 text-xs ${dueClass}`}>
                          <Calendar className="h-3 w-3" />
                          {dueText}
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 text-xs text-muted-foreground flex justify-between items-center">
                      <span>{task.assignee?.full_name || 'Unassigned'}</span>
                    </div>
                  </div>
                );
              })}
              
              {columnTasks.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-md">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
