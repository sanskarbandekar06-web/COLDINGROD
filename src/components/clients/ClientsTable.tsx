'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Client } from '@/types/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { CreateClientModal } from './CreateClientModal';
import { ClientDrawer } from './ClientDrawer';

interface ClientsTableProps {
  clients: Client[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  workspaceSlug: string;
}

export function ClientsTable({ clients, totalPages, currentPage, workspaceId, workspaceSlug }: ClientsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);

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

  const openDrawer = (clientId: string) => {
    setDrawerClientId(clientId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 w-full sm:max-w-sm flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              className="pl-9 bg-background"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </form>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> New Client
          </Button>
        </div>
      </div>

      <div className="coldingrod-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow 
                  key={client.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDrawer(client.id)}
                >
                  <TableCell className="font-medium">
                    {client.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {client.industry || '--'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.website ? (
                      <a 
                        href={client.website.startsWith('http') ? client.website : `https://${client.website}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="hover:underline text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.website}
                      </a>
                    ) : (
                      '--'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(client.created_at), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))
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

      <CreateClientModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        workspaceId={workspaceId} 
      />
      
      {drawerClientId && (
        <ClientDrawer 
          isOpen={drawerClientId !== null}
          onClose={() => setDrawerClientId(null)}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          clientId={drawerClientId}
        />
      )}
    </div>
  );
}
