export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  is_personal: boolean;
  industry?: string | null;
  timezone?: string | null;
  country?: string | null;
  currency?: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  joined_at: string;
}

export interface WorkspaceContextData {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
}
