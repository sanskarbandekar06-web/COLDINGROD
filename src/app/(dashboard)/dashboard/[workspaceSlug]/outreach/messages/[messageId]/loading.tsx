import { Skeleton } from '@/components/ui/skeleton';

export default function MessageDetailLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
