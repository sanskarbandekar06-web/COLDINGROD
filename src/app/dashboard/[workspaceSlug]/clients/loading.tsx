import { Skeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-full sm:max-w-sm" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
        <div className="rounded-md border">
          <div className="border-b p-4">
            <Skeleton className="h-6 w-full" />
          </div>
          <div className="p-4 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
