import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Asset } from '@/types/asset';
import { FileIcon } from 'lucide-react';
import { format } from 'date-fns';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function AssetListMini({ assets, workspaceId }: { assets: Asset[], workspaceId: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileIcon className="h-4 w-4 text-muted-foreground" />
          Assets
        </CardTitle>
        <Link href={`/dashboard/${workspaceId}/assets`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 text-xs' })}>View All</Link>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assets found.</p>
        ) : (
          <div className="space-y-3">
            {assets.slice(0, 5).map(a => (
              <div key={a.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className="bg-muted p-1.5 rounded text-muted-foreground">
                    <FileIcon className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col max-w-[150px] sm:max-w-[200px]">
                    <span className="font-medium truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(a.created_at), 'MMM d, yyyy')}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
