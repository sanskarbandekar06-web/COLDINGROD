'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { archiveProjectAction, updateProjectStatusAction } from '@/actions/projects';
import { Button } from '@/components/ui/button';
import type { Project, ProjectStatus } from '@/types/project';
import { EditProjectModal } from './EditProjectModal';

interface ProjectHeaderProps {
  project: Project & {
    client?: { id: string; name: string } | null;
    owner?: { id: string; full_name: string } | null;
  };
  workspaceId: string;
  workspaceSlug: string;
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
}

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' }, { value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
];

export function ProjectHeader({ project, workspaceId, workspaceSlug, clients, members }: ProjectHeaderProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleStatusChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setIsPending(true);
    const result = await updateProjectStatusAction(workspaceId, project.id, event.target.value as ProjectStatus);
    setIsPending(false);
    if (result.error) toast.error(result.error);
    else toast.success('Project status updated');
  };

  const handleArchive = async () => {
    if (!confirm('Archive this project? Its tasks remain archived with the project until it is restored.')) return;
    setIsPending(true);
    const result = await archiveProjectAction(workspaceId, project.id);
    setIsPending(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Project archived');
      router.push(`/dashboard/${workspaceSlug}/projects`);
    }
  };

  return (
    <>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{project.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {project.client && <div>Client: <span className="font-medium text-foreground">{project.client.name}</span></div>}
            <div>Owner: <span className="font-medium text-foreground">{project.owner?.full_name || 'Unassigned'}</span></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={project.status} onChange={handleStatusChange} disabled={isPending} aria-label="Project status" className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)} disabled={isPending}>Edit</Button>
          <Button variant="outline" size="sm" onClick={handleArchive} disabled={isPending} className="text-destructive hover:text-destructive">Archive</Button>
        </div>
      </div>
      <EditProjectModal open={isEditOpen} onClose={() => setIsEditOpen(false)} workspaceId={workspaceId} project={project} clients={clients} members={members} />
    </>
  );
}
