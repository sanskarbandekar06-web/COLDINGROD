import Link from 'next/link';
import { format } from 'date-fns';
import { FileIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFileSize } from '@/lib/asset-utils';
import type { Asset } from '@/types/asset';

interface AssetListMiniProps {
  assets: Asset[];
  workspaceSlug: string;
}

export function AssetListMini({
  assets,
  workspaceSlug,
}: AssetListMiniProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileIcon className="size-4 text-muted-foreground" />
          Assets
        </CardTitle>
        <Link
          href={`/dashboard/${workspaceSlug}/assets`}
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'h-8 text-xs',
          })}
        >
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assets found.</p>
        ) : (
          <div className="space-y-3">
            {assets.slice(0, 5).map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between border-b pb-2 text-sm last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="rounded bg-muted p-1.5 text-muted-foreground">
                    <FileIcon className="size-4" />
                  </div>
                  <div className="flex min-w-0 max-w-52 flex-col">
                    <span className="truncate font-medium">{asset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(asset.size_bytes)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(asset.created_at), 'MMM d, yyyy')}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
