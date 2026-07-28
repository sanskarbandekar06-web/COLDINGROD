import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricGridProps {
  children: ReactNode;
  className?: string;
}

export function MetricGrid({ children, className }: MetricGridProps) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}
