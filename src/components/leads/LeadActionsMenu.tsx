'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { convertLeadToClient, deleteLead } from '@/actions/lead';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { LeadStatus } from '@/types/lead';
import { EditLeadModal } from './EditLeadModal';

export function LeadActionsMenu({ lead, workspaceId, workspaceSlug, members }: {
  lead: { id: string; company_name: string; source: string | null; status: LeadStatus; assigned_to: string | null };
  workspaceId: string;
  workspaceSlug: string;
  members: { id: string; full_name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm('Archive this lead? You can restore it from lead trash.')) return;
    startTransition(async () => {
      const result = await deleteLead(workspaceId, lead.id, workspaceSlug);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Lead archived');
        router.replace(`/dashboard/${workspaceSlug}/leads`);
        router.refresh();
      }
    });
  };

  const handleConvert = () => {
    if (!confirm('Convert this lead into a client and mark it as won?')) return;
    startTransition(async () => {
      const result = await convertLeadToClient(workspaceId, lead.id);
      if (result.error || !result.clientId) toast.error(result.error || 'Lead could not be converted.');
      else {
        toast.success('Lead converted to client');
        router.push(`/dashboard/${workspaceSlug}/clients/${result.clientId}`);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" disabled={isPending} aria-label="Lead actions"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="cursor-pointer"><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Edit lead</DropdownMenuItem>
          <DropdownMenuItem onClick={handleConvert} className="cursor-pointer text-emerald-600 focus:bg-emerald-50 focus:text-emerald-600"><Building className="mr-2 h-4 w-4" aria-hidden="true" />Convert to client</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Archive lead</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isEditOpen && <EditLeadModal isOpen onClose={() => setIsEditOpen(false)} workspaceId={workspaceId} lead={lead} members={members} />}
    </>
  );
}
