'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center space-y-4">
      <div className="flex items-center space-x-2 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <h2 className="text-xl font-semibold">Something went wrong!</h2>
      </div>
      <p className="text-muted-foreground max-w-md text-center">
        An unexpected error occurred while loading this page. Our team has been notified.
      </p>
      <Button onClick={() => reset()} variant="outline">
        Try again
      </Button>
    </div>
  );
}
