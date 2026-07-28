'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { CreateProjectModal } from './CreateProjectModal';
import { Project } from '@/types/project';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

interface ProjectsTableProps {
  projects: (Project & { 
    client?: { name: string } | null,
    owner?: { full_name: string } | null,
    taskStats?: { total: number, completed: number }
  })[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  clients: { id: string, name: string }[];
  members: { id: string, full_name: string }[];
}

export function ProjectsTable({ projects, totalPages, currentPage, workspaceId, clients, members }: ProjectsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput) {
      params.set('search', searchInput);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 w-full sm:max-w-sm flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              className="pl-9 bg-background"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </form>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> New Project
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => {
                const totalTasks = project.taskStats?.total || 0;
                const completedTasks = project.taskStats?.completed || 0;
                const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                
                return (
                  <TableRow key={project.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <Link 
                        href={`/dashboard/${workspaceId}/projects/${project.id}`}
                        className="hover:underline text-primary"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.client?.name || '--'}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted capitalize text-foreground">
                        {project.status.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.owner?.full_name || 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {totalTasks === 0 ? (
                        <span className="text-muted-foreground">No tasks</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-secondary rounded-full h-2 max-w-[100px]">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                          </div>
                          <span className="text-muted-foreground">{progress}%</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(project.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link 
                        href={`/dashboard/${workspaceId}/projects/${project.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <CreateProjectModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        workspaceId={workspaceId} 
        clients={clients}
        members={members}
      />
    </div>
  );
}
