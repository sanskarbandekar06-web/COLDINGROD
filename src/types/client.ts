export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
