import { Skeleton } from '@/components/ui/skeleton';

export default function MessagesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-36 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
