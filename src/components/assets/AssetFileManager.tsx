'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Archive as ArchiveIcon,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileImage,
  FileText,
  Film,
  FolderOpen,
  Music,
  Search,
  X,
} from 'lucide-react';
import { AssetRowActions } from '@/components/assets/AssetRowActions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ASSET_SOURCE_LABELS,
  formatFileSize,
  getAssetCategory,
} from '@/lib/asset-utils';
import type {
  AssetCategory,
  AssetUploadSource,
  PaginatedAssets,
} from '@/types/asset';

interface AssetFileManagerProps {
  result: PaginatedAssets;
  workspaceId: string;
  search: string;
  source?: AssetUploadSource;
  category: AssetCategory;
  archived: boolean;
  canManage: boolean;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  all: 'All file types',
  image: 'Images',
  document: 'Documents',
  video: 'Video',
  audio: 'Audio',
  archive: 'Archives',
};

function FileTypeIcon({ fileType }: { fileType: string }) {
  const category = getAssetCategory(fileType);
  const className = 'size-5';

  if (category === 'image') return <FileImage className={className} />;
  if (category === 'video') return <Film className={className} />;
  if (category === 'audio') return <Music className={className} />;
  if (category === 'archive') return <FileArchive className={className} />;
  return <FileText className={className} />;
}

export function AssetFileManager({
  result,
  workspaceId,
  search,
  source,
  category,
  archived,
  canManage,
}: AssetFileManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(search);

  function updateParam(key: string, value?: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function goToPage(page: number): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`);
  }

  const hasFilters = Boolean(search || source || category !== 'all');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            updateParam('search', searchInput.trim() || undefined);
          }}
        >
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search file names"
              aria-label="Search file names"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={source ?? '__all__'}
            onValueChange={(value) =>
              updateParam('source', value === '__all__' ? undefined : (value ?? undefined))
            }
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by source">
              <SelectValue>{source ? ASSET_SOURCE_LABELS[source] : 'All sources'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sources</SelectItem>
              {Object.entries(ASSET_SOURCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={category}
            onValueChange={(value) =>
              updateParam(
                'category',
                !value || value === 'all' ? undefined : value,
              )
            }
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by file type">
              <SelectValue>{CATEGORY_LABELS[category]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput('');
                const params = new URLSearchParams();
                if (archived) params.set('archived', 'true');
                router.push(`?${params.toString()}`);
              }}
            >
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {result.data.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              {archived ? (
                <ArchiveIcon className="size-6 text-muted-foreground" />
              ) : (
                <FolderOpen className="size-6 text-muted-foreground" />
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold">
              {hasFilters
                ? 'No matching files'
                : archived
                  ? 'Archive is empty'
                  : 'No files yet'}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {hasFilters
                ? 'Try a different search or clear the current filters.'
                : archived
                  ? 'Archived files will appear here and can be restored.'
                  : canManage
                    ? 'Upload the first private file to start your workspace library.'
                    : 'A workspace manager can upload files to this library.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">File</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>{archived ? 'Archived' : 'Uploaded'}</TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="max-w-80 pl-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <FileTypeIcon fileType={asset.file_type} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium" title={asset.name}>
                          {asset.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {asset.file_type}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ASSET_SOURCE_LABELS[asset.upload_source]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFileSize(asset.size_bytes)}
                  </TableCell>
                  <TableCell className="max-w-48">
                    <span className="block truncate">
                      {asset.uploader?.full_name || asset.uploader?.email || 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(
                      new Date(
                        archived && asset.deleted_at
                          ? asset.deleted_at
                          : asset.created_at,
                      ),
                      'MMM d, yyyy',
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <AssetRowActions
                      assetId={asset.id}
                      assetName={asset.name}
                      workspaceId={workspaceId}
                      archived={archived}
                      canManage={canManage}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {result.count === 0
            ? '0 files'
            : `${(result.page - 1) * result.limit + 1}–${Math.min(
                result.page * result.limit,
                result.count,
              )} of ${result.count} files`}
        </p>
        {result.totalPages > 1 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(result.page - 1)}
              disabled={result.page <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(result.page + 1)}
              disabled={result.page >= result.totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
