import React from 'react';
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center space-y-4">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-2xl font-semibold">Page Not Found</h2>
      <p className="text-muted-foreground max-w-md text-center">
        We couldn't find the page or workspace you're looking for. It might have been deleted or you don't have access.
      </p>
      <Link href="/dashboard" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
        Return to Dashboard
      </Link>
    </div>
  );
}
