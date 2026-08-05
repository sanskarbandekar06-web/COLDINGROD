'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { restoreProjectAction } from '@/actions/projects';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Project } from '@/types/project';
import { CreateProjectModal } from './CreateProjectModal';

interface ProjectsTableProps {
  projects: (Project & {
    client?: { name: string } | null;
    owner?: { full_name: string } | null;
    taskStats?: { total: number; completed: number };
  })[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  workspaceSlug: string;
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  archived?: boolean;
}

export function ProjectsTable({ projects, totalPages, currentPage, workspaceId, workspaceSlug, clients, members, archived = false }: ProjectsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateQuery = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    router.push(`?${params.toString()}`);
  };

  const handleRestore = (project: Project) => {
    setBusyProjectId(project.id);
    startTransition(async () => {
      const result = await restoreProjectAction(workspaceId, project.id);
      setBusyProjectId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Project restored');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Link href={`/dashboard/${workspaceSlug}/projects`} className={buttonVariants({ variant: archived ? 'ghost' : 'secondary', size: 'sm' })}>Active</Link>
        <Link href={`/dashboard/${workspaceSlug}/projects?view=archived`} className={buttonVariants({ variant: archived ? 'secondary' : 'ghost', size: 'sm' })}>Archived</Link>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <form onSubmit={(event) => { event.preventDefault(); updateQuery({ search: searchInput.trim() || null, page: '1' }); }} className="w-full max-w-sm flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input placeholder="Search projects…" className="bg-background pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </div>
        </form>
        {!archived && <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" aria-hidden="true" />New project</Button>}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead>Owner</TableHead><TableHead>Progress</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No {archived ? 'archived ' : ''}projects found.</TableCell></TableRow>
            ) : projects.map((project) => {
              const totalTasks = project.taskStats?.total || 0;
              const completedTasks = project.taskStats?.completed || 0;
              const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              return (
                <TableRow key={project.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{archived ? project.name : <Link href={`/dashboard/${workspaceSlug}/projects/${project.id}`} className="text-primary hover:underline">{project.name}</Link>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{project.client?.name || '—'}</TableCell>
                  <TableCell><span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium capitalize">{project.status.replace('_', ' ')}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{project.owner?.full_name || 'Unassigned'}</TableCell>
                  <TableCell className="text-sm">{totalTasks === 0 ? <span className="text-muted-foreground">No tasks</span> : <div className="flex items-center gap-2"><div className="h-2 w-full max-w-[100px] rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><span className="text-muted-foreground">{progress}%</span></div>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(project.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">{archived ? <Button variant="ghost" size="sm" disabled={isPending && busyProjectId === project.id} onClick={() => handleRestore(project)}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Restore</Button> : <Link href={`/dashboard/${workspaceSlug}/projects/${project.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>View</Link>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => updateQuery({ page: String(currentPage - 1) })} disabled={currentPage <= 1}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Previous</Button><Button variant="outline" size="sm" onClick={() => updateQuery({ page: String(currentPage + 1) })} disabled={currentPage >= totalPages}>Next<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button></div></div>}

      {!archived && <CreateProjectModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} workspaceId={workspaceId} clients={clients} members={members} />}
    </div>
  );
}
