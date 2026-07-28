'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface DynamicBreadcrumbsProps {
  workspaceName: string;
  workspaceSlug: string;
}

export function DynamicBreadcrumbs({ workspaceName, workspaceSlug }: DynamicBreadcrumbsProps) {
  const pathname = usePathname();
  
  // Example pathname: /dashboard/my-workspace/projects/123
  // Segments: ['dashboard', 'my-workspace', 'projects', '123']
  const segments = pathname.split('/').filter(Boolean);
  
  // Find where the workspace slug is in the path
  const workspaceIndex = segments.indexOf(workspaceSlug);
  
  // If we can't find it or it's the last segment, just show workspace root
  if (workspaceIndex === -1 || workspaceIndex === segments.length - 1) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{workspaceName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  // Get the path segments AFTER the workspace slug
  const trailingSegments = segments.slice(workspaceIndex + 1);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`/dashboard/${workspaceSlug}`}>
            {workspaceName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        
        {trailingSegments.map((segment, index) => {
          const isLast = index === trailingSegments.length - 1;
          const href = `/dashboard/${workspaceSlug}/${trailingSegments.slice(0, index + 1).join('/')}`;
          
          // Format text (capitalize, replace hyphens)
          const text = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

          return (
            <React.Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{text}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{text}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
