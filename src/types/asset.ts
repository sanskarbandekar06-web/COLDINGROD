export interface Asset {
  id: string;
  workspace_id: string;
  name: string;
  file_path: string;
  file_type: string;
  size_bytes: number;
  entity_type: string | null;
  entity_id: string | null;
  uploaded_by: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  deleted_at: string | null;
}
