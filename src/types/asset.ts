export const ASSET_UPLOAD_SOURCES = [
  'client',
  'lead',
  'project',
  'portfolio',
  'analysis',
  'summary',
  'general',
] as const;

export type AssetUploadSource = (typeof ASSET_UPLOAD_SOURCES)[number];

export const ASSET_CATEGORIES = [
  'all',
  'image',
  'document',
  'video',
  'audio',
  'archive',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface Asset {
  id: string;
  workspace_id: string;
  name: string;
  file_path: string;
  file_type: string;
  size_bytes: number;
  entity_type: string | null;
  entity_id: string | null;
  upload_source: AssetUploadSource;
  uploaded_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetWithUploader extends Asset {
  uploader: {
    full_name: string | null;
    email: string;
  } | null;
}

export interface AssetRelationOption {
  id: string;
  label: string;
}

export interface AssetRelationOptions {
  clients: AssetRelationOption[];
  leads: AssetRelationOption[];
  projects: AssetRelationOption[];
}

export interface AssetStats {
  activeFiles: number;
  archivedFiles: number;
  totalBytes: number;
  imageFiles: number;
}

export interface PaginatedAssets {
  data: AssetWithUploader[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetAssetsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  source?: AssetUploadSource;
  category?: AssetCategory;
  archived?: boolean;
}

export interface CreateAssetRecordInput {
  workspaceId: string;
  workspaceSlug: string;
  name: string;
  filePath: string;
  fileType: string;
  sizeBytes: number;
  uploadSource: AssetUploadSource;
  entityId?: string | null;
}

export type AssetActionResult =
  | { success: true; assetId?: string }
  | { success: false; error: string };
