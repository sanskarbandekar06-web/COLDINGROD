'use client';

import { useState } from 'react';
import { updateTaskStatusAction } from '@/actions/tasks';
import { TaskStatus } from '@/types/task';
import { toast } from 'sonner';

interface TaskStatusDropdownProps {
  workspaceId: string;
  taskId: string;
  currentStatus: TaskStatus;
}

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function TaskStatusDropdown({ workspaceId, taskId, currentStatus }: TaskStatusDropdownProps) {
  const [isPending, setIsPending] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as TaskStatus;
    if (newStatus === currentStatus) return;

    setIsPending(true);
    const result = await updateTaskStatusAction(workspaceId, taskId, newStatus);
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success('Status updated');
    }
  };

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={isPending}
      className="h-8 w-[130px] rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 capitalize"
    >
      {statusOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
