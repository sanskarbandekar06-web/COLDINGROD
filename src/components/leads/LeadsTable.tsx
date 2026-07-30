'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LeadListItem } from '@/types/lead';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CreateLeadModal } from './CreateLeadModal';
import { LeadDrawer } from './LeadDrawer';

interface LeadsTableProps {
  leads: LeadListItem[];
  totalPages: number;
  currentPage: number;
  workspaceId: string;
  workspaceSlug: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  analyzed: 'bg-purple-100 text-purple-800 border-purple-200',
  contacted: 'bg-amber-100 text-amber-800 border-amber-200',
  responded: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  meeting_scheduled: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  won: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  lost: 'bg-rose-100 text-rose-800 border-rose-200',
};

export function LeadsTable({ leads, totalPages, currentPage, workspaceId, workspaceSlug }: LeadsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);

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

  const openDrawer = (leadId: string) => {
    setDrawerLeadId(leadId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 w-full sm:max-w-sm flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              className="pl-9 bg-background"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="icon">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </form>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> New Lead
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No leads found.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow 
                  key={lead.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDrawer(lead.id)}
                >
                  <TableCell className="font-medium">
                    {lead.company_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-normal capitalize ${statusColors[lead.status] || ''}`}>
                      {lead.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {lead.score ? (
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${lead.score.score > 70 ? 'bg-emerald-500' : lead.score.score > 40 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        {lead.score.score}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {lead.source || '--'}
                  </TableCell>
                  <TableCell>
                    {lead.assigned_user ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {lead.assigned_user.avatar_url && <AvatarImage src={lead.assigned_user.avatar_url} />}
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {lead.assigned_user.full_name?.charAt(0) || lead.assigned_user.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{lead.assigned_user.full_name || 'User'}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), 'MMM d, yyyy')}
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

      <CreateLeadModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        workspaceId={workspaceId} 
      />
      
      <LeadDrawer 
        isOpen={drawerLeadId !== null}
        onClose={() => setDrawerLeadId(null)}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        leadId={drawerLeadId}
      />
    </div>
  );
}
