export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface Project {
  id: string;
  workspace_id: string;
  client_id: string | null;
  name: string;
  status: ProjectStatus;
  owner_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
