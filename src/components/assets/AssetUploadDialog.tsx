'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Plus, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { createAssetRecordAction } from '@/actions/assets';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ASSET_ACCEPT,
  ASSET_BUCKET,
  ASSET_SOURCE_LABELS,
  MAX_ASSET_FILES_PER_UPLOAD,
  MAX_ASSET_FILE_SIZE_BYTES,
  formatFileSize,
  isAllowedAssetMimeType,
  sanitizeStorageFileName,
} from '@/lib/asset-utils';
import { createClient } from '@/lib/supabase/client';
import type {
  AssetRelationOptions,
  AssetUploadSource,
} from '@/types/asset';

interface AssetUploadDialogProps {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  relationOptions: AssetRelationOptions;
}

const RELATION_SOURCES: AssetUploadSource[] = ['client', 'lead', 'project'];

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function fileMimeType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME_TYPES[extension] ?? '';
}

function relationLabel(source: AssetUploadSource): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function AssetUploadDialog({
  workspaceId,
  workspaceSlug,
  userId,
  relationOptions,
}: AssetUploadDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<AssetUploadSource>('general');
  const [entityId, setEntityId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);

  const relationRequired = RELATION_SOURCES.includes(source);
  const options =
    source === 'client'
      ? relationOptions.clients
      : source === 'lead'
        ? relationOptions.leads
        : source === 'project'
          ? relationOptions.projects
          : [];

  function reset(): void {
    setFiles([]);
    setSource('general');
    setEntityId('');
    setCompleted(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  function addFiles(fileList: FileList | File[]): void {
    const incoming = Array.from(fileList);
    const combined = [...files, ...incoming].slice(0, MAX_ASSET_FILES_PER_UPLOAD);
    const unique = combined.filter(
      (file, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        ) === index,
    );

    const invalid = unique.find(
      (file) =>
        file.size > MAX_ASSET_FILE_SIZE_BYTES ||
        !isAllowedAssetMimeType(fileMimeType(file)),
    );
    if (invalid) {
      toast.error(
        invalid.size > MAX_ASSET_FILE_SIZE_BYTES
          ? `${invalid.name} is larger than 25 MB.`
          : `${invalid.name} is not a supported file type.`,
      );
      return;
    }
    if (files.length + incoming.length > MAX_ASSET_FILES_PER_UPLOAD) {
      toast.info(`You can upload up to ${MAX_ASSET_FILES_PER_UPLOAD} files at once.`);
    }
    setFiles(unique);
  }

  async function uploadFiles(): Promise<void> {
    if (files.length === 0) {
      toast.error('Choose at least one file.');
      return;
    }
    if (relationRequired && !entityId) {
      toast.error(`Choose a ${source} for these files.`);
      return;
    }

    setUploading(true);
    setCompleted(0);
    const failures: string[] = [];
    let successCount = 0;

    for (const file of files) {
      const mimeType = fileMimeType(file);
      const filePath = `${workspaceId}/${userId}/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(ASSET_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        failures.push(`${file.name}: ${uploadError.message}`);
        setCompleted((value) => value + 1);
        continue;
      }

      const result = await createAssetRecordAction({
        workspaceId,
        workspaceSlug,
        name: file.name,
        filePath,
        fileType: mimeType,
        sizeBytes: file.size,
        uploadSource: source,
        entityId: relationRequired ? entityId : null,
      });

      if (!result.success) {
        await supabase.storage.from(ASSET_BUCKET).remove([filePath]);
        failures.push(`${file.name}: ${result.error}`);
      } else {
        successCount += 1;
      }
      setCompleted((value) => value + 1);
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(
        `${successCount} ${successCount === 1 ? 'file' : 'files'} uploaded.`,
      );
      router.refresh();
    }
    if (failures.length > 0) {
      toast.error(
        failures.length === 1
          ? failures[0]
          : `${failures.length} files could not be uploaded.`,
      );
    }
    if (failures.length === 0) {
      setOpen(false);
      reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (uploading) return;
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        Upload files
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload workspace files</DialogTitle>
          <DialogDescription>
            Files are stored privately and are only available to active workspace
            members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asset-source">File belongs to</Label>
              <Select
                value={source}
                onValueChange={(value) => {
                  setSource((value as AssetUploadSource | null) ?? 'general');
                  setEntityId('');
                }}
                disabled={uploading}
              >
                <SelectTrigger id="asset-source" className="w-full">
                  <SelectValue>{ASSET_SOURCE_LABELS[source]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {relationRequired && (
              <div className="space-y-2">
                <Label htmlFor="asset-relation">{relationLabel(source)}</Label>
                <Select
                  value={entityId}
                  onValueChange={(value) => setEntityId(value ?? '')}
                  disabled={uploading}
                >
                  <SelectTrigger id="asset-relation" className="w-full">
                    <SelectValue placeholder={`Choose ${source}`}>{options.find((option) => option.id === entityId)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {options.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active {source} records are available.
                  </p>
                )}
              </div>
            )}
          </div>

          <label
            htmlFor="asset-files"
            aria-disabled={uploading}
            className="block cursor-pointer rounded-xl border border-dashed bg-muted/30 p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!uploading) addFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Drop files here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Images, video, audio, PDF, documents, spreadsheets, slides, or ZIP.
              Maximum 25 MB each.
            </p>
            <span
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'mt-4',
              })}
            >
              <FileUp className="size-4" />
              Browse files
            </span>
            <input
              id="asset-files"
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={ASSET_ACCEPT}
              multiple
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
              }}
              disabled={uploading}
            />
          </label>


          {files.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <FileUp className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, fileIndex) => fileIndex !== index),
                      )
                    }
                    disabled={uploading}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={uploadFiles}
            disabled={
              uploading ||
              files.length === 0 ||
              (relationRequired && (!entityId || options.length === 0))
            }
          >
            {uploading && <Loader2 className="size-4 animate-spin" />}
            {uploading
              ? `Uploading ${Math.min(completed + 1, files.length)} of ${files.length}`
              : `Upload ${files.length || ''} ${files.length === 1 ? 'file' : 'files'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
