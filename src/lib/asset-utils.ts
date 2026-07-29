import type { AssetCategory, AssetUploadSource } from '@/types/asset';

export const ASSET_BUCKET = 'workspace-assets';
export const MAX_ASSET_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ASSET_FILES_PER_UPLOAD = 10;

export const ASSET_ACCEPT = [
  'image/*',
  'video/*',
  'audio/*',
  '.pdf',
  '.txt',
  '.csv',
  '.json',
  '.zip',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
].join(',');

export const ASSET_SOURCE_LABELS: Record<AssetUploadSource, string> = {
  client: 'Client',
  lead: 'Lead',
  project: 'Project',
  portfolio: 'Portfolio',
  analysis: 'Analysis',
  summary: 'Summary',
  general: 'General',
};

const EXACT_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function isAllowedAssetMimeType(fileType: string): boolean {
  return (
    fileType.startsWith('image/') ||
    fileType.startsWith('video/') ||
    fileType.startsWith('audio/') ||
    EXACT_ALLOWED_MIME_TYPES.has(fileType)
  );
}

export function getAssetCategory(fileType: string): Exclude<AssetCategory, 'all'> {
  if (fileType.startsWith('image/')) return 'image';
  if (fileType.startsWith('video/')) return 'video';
  if (fileType.startsWith('audio/')) return 'audio';
  if (
    fileType.includes('zip') ||
    fileType.includes('compressed') ||
    fileType.includes('archive')
  ) {
    return 'archive';
  }
  return 'document';
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function sanitizeStorageFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[^\w.\-()',!&$@=;:+? ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized.slice(0, 180) || 'file';
}
