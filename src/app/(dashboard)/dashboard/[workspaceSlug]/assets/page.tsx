import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Archive, Files, HardDrive, Image as ImageIcon } from 'lucide-react';
import { AssetFileManager } from '@/components/assets/AssetFileManager';
import { AssetUploadDialog } from '@/components/assets/AssetUploadDialog';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatFileSize } from '@/lib/asset-utils';
import {
  getAssetRelationOptions,
  getAssets,
  getAssetStats,
} from '@/services/asset.service';
import { getWorkspaceContext } from '@/services/workspace.service';
import {
  ASSET_CATEGORIES,
  ASSET_UPLOAD_SOURCES,
  type AssetCategory,
  type AssetRelationOptions,
  type AssetUploadSource,
} from '@/types/asset';

export const metadata: Metadata = {
  title: 'Assets | Coldingrod',
  description: 'Manage private workspace files and related project assets.',
};

interface AssetsPageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_RELATIONS: AssetRelationOptions = {
  clients: [],
  leads: [],
  projects: [],
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function validSource(value: string): AssetUploadSource | undefined {
  return ASSET_UPLOAD_SOURCES.find((source) => source === value);
}

function validCategory(value: string): AssetCategory {
  return ASSET_CATEGORIES.find((category) => category === value) ?? 'all';
}

export default async function AssetsPage({
  params,
  searchParams,
}: AssetsPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) notFound();

  const canManage = context.permissions.includes('manage_assets');
  const archived = canManage && firstValue(query.archived) === 'true';
  const search = firstValue(query.search).trim().slice(0, 100);
  const source = validSource(firstValue(query.source));
  const category = validCategory(firstValue(query.category));
  const requestedPage = Number.parseInt(firstValue(query.page), 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

  const [result, stats, relationOptions] = await Promise.all([
    getAssets({
      workspaceId: context.workspace.id,
      page,
      limit: 20,
      search,
      source,
      category,
      archived,
    }),
    getAssetStats(context.workspace.id),
    canManage
      ? getAssetRelationOptions(context.workspace.id)
      : Promise.resolve(EMPTY_RELATIONS),
  ]);

  const metrics = [
    {
      label: 'Active files',
      value: stats.activeFiles.toLocaleString(),
      icon: Files,
    },
    {
      label: 'Storage used',
      value: formatFileSize(stats.totalBytes),
      icon: HardDrive,
    },
    {
      label: 'Images',
      value: stats.imageFiles.toLocaleString(),
      icon: ImageIcon,
    },
    {
      label: 'Archived',
      value: stats.archivedFiles.toLocaleString(),
      icon: Archive,
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {archived ? 'Archived files' : 'Assets'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {archived
              ? 'Review and restore files removed from the active library.'
              : 'A private, searchable file library for your workspace.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Link
              href={`/dashboard/${workspaceSlug}/assets${
                archived ? '' : '?archived=true'
              }`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Archive className="size-4" />
              {archived ? 'View active files' : 'View archive'}
            </Link>
          )}
          {canManage && !archived && (
            <AssetUploadDialog
              workspaceId={context.workspace.id}
              workspaceSlug={workspaceSlug}
              userId={context.user.id}
              relationOptions={relationOptions}
            />
          )}
        </div>
      </div>

      {!archived && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold tracking-tight">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AssetFileManager
        result={result}
        workspaceId={context.workspace.id}
        search={search}
        source={source}
        category={category}
        archived={archived}
        canManage={canManage}
      />
    </div>
  );
}
