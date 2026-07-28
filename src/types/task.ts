export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string;
  assigned_to: string | null;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
