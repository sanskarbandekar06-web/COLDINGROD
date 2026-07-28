'use client';

import { useState } from 'react';
import { Project, ProjectStatus } from '@/types/project';
import { updateProjectStatusAction, archiveProjectAction } from '@/actions/projects';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface ProjectHeaderProps {
  project: Project & {
    client?: { id: string, name: string } | null,
    owner?: { id: string, full_name: string } | null
  };
  workspaceId: string;
}

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function ProjectHeader({ project, workspaceId }: ProjectHeaderProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as ProjectStatus;
    setIsPending(true);
    const result = await updateProjectStatusAction(workspaceId, project.id, newStatus);
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success('Project status updated');
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this project?')) return;
    setIsPending(true);
    const result = await archiveProjectAction(workspaceId, project.id);
    if (result?.error) {
      toast.error(result.error);
      setIsPending(false);
    } else {
      toast.success('Project archived');
      router.push(`/dashboard/${workspaceId}/projects`);
    }
  };

  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          {project.client && (
            <div>
              Client: <span className="font-medium text-foreground">{project.client.name}</span>
            </div>
          )}
          <div>
            Owner: <span className="font-medium text-foreground">{project.owner?.full_name || 'Unassigned'}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <select
          value={project.status}
          onChange={handleStatusChange}
          disabled={isPending}
          className="h-9 px-3 py-1 rounded-md border border-input bg-background text-sm font-medium capitalize focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleArchive}
          disabled={isPending}
          className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
        >
          Archive
        </Button>
      </div>
    </div>
  );
}
