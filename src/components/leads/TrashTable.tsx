'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lead } from '@/types/lead';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { RotateCcw } from 'lucide-react';
import { restoreLead } from '@/actions/lead';

export function TrashTable({ leads, workspaceId, workspaceSlug }: { leads: Lead[], workspaceId: string, workspaceSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRestore = (leadId: string) => {
    startTransition(async () => {
      const result = await restoreLead(workspaceId, leadId, workspaceSlug);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Lead restored');
      router.refresh();
    });
  };

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Deleted At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center">
                Trash is empty.
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  {lead.company_name}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.deleted_at ? format(new Date(lead.deleted_at), 'PPP') : '--'}
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleRestore(lead.id)}
                    disabled={isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" /> Restore
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
