import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project } from '@/types/project';
import { Briefcase } from 'lucide-react';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function ProjectListMini({ projects, workspaceSlug }: { projects: Project[], workspaceSlug: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Projects
        </CardTitle>
        <Link href={`/dashboard/${workspaceSlug}/projects`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 text-xs' })}>View All</Link>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects found.</p>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map(p => (
              <div key={p.id} className="flex justify-between items-center text-sm">
                <Link href={`/dashboard/${workspaceSlug}/projects/${p.id}`} className="font-medium hover:underline hover:text-primary">
                  {p.name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground capitalize">{p.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
