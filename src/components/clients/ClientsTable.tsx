'use client';

import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { restoreClientAction } from '@/actions/clients';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Client } from '@/types/client';
import { ClientDrawer } from './ClientDrawer';
import { CreateClientModal } from './CreateClientModal';

interface ClientsTableProps {
  clients: Client[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  workspaceSlug: string;
  archived: boolean;
}

export function ClientsTable({
  clients,
  totalPages,
  currentPage,
  workspaceId,
  workspaceSlug,
  archived,
}: ClientsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = `/dashboard/${workspaceSlug}/clients`;
  const currentSearch = searchParams.get('search') || '';
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) params.set('search', searchInput.trim());
    else params.delete('search');
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`?${params.toString()}`);
  };

  const restore = (clientId: string) => {
    setPendingId(clientId);
    startTransition(async () => {
      const result = await restoreClientAction(workspaceId, clientId);
      setPendingId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Client restored');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="flex w-full max-w-sm items-center gap-2">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${archived ? 'archived ' : ''}clients...`}
                className="bg-background pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </form>
          <div className="flex rounded-lg border bg-card p-1" aria-label="Client view">
            <Link
              href={basePath}
              className={buttonVariants({ variant: archived ? 'ghost' : 'secondary', size: 'sm' })}
            >
              Active
            </Link>
            <Link
              href={`${basePath}?view=archived`}
              className={buttonVariants({ variant: archived ? 'secondary' : 'ghost', size: 'sm' })}
            >
              Archived
            </Link>
          </div>
        </div>
        {!archived && (
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> New Client
          </Button>
        )}
      </div>

      <div className="coldingrod-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>{archived ? 'Archived' : 'Created'}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {archived ? 'No archived clients.' : 'No clients found.'}
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow
                  key={client.id}
                  className={archived ? undefined : 'cursor-pointer hover:bg-muted/50'}
                  onClick={archived ? undefined : () => setDrawerClientId(client.id)}
                >
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-sm capitalize text-muted-foreground">
                    {client.industry || '--'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.website ? (
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {client.website}
                      </a>
                    ) : '--'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(archived ? client.deleted_at || client.updated_at : client.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    {archived ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending && pendingId === client.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          restore(client.id);
                        }}
                      >
                        <RotateCcw className="size-4" />
                        {isPending && pendingId === client.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`${basePath}/${client.id}`);
                        }}
                      >
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateClientModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={workspaceId}
      />

      {drawerClientId && (
        <ClientDrawer
          isOpen
          onClose={() => setDrawerClientId(null)}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          clientId={drawerClientId}
        />
      )}
    </div>
  );
}
