import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function SectionCard({ title, description, children, className, action }: SectionCardProps) {
  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action && <div>{action}</div>}
      </CardHeader>
      <CardContent className="flex-1">
        {children}
      </CardContent>
    </Card>
  );
}
