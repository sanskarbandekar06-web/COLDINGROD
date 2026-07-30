'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteLead, convertLeadToClient } from '@/actions/lead';
import { Button } from '@/components/ui/button';
import { Trash2, Building, Pencil, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { EditLeadModal } from './EditLeadModal';
import type { LeadStatus } from '@/types/lead';

export function LeadActionsMenu({
  lead,
  workspaceId,
  workspaceSlug,
}: {
  lead: {
    id: string;
    company_name: string;
    source: string | null;
    status: LeadStatus;
  };
  workspaceId: string;
  workspaceSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this lead? It will be moved to trash.')) return;
    startTransition(async () => {
      await deleteLead(workspaceId, lead.id);
      router.push(`/dashboard/${workspaceSlug}/leads`);
    });
  };

  const handleConvert = () => {
    if (!confirm('Convert this lead to a Client? This will mark it as Won.')) return;
    startTransition(async () => {
      await convertLeadToClient(workspaceId, lead.id);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={isPending}
              aria-label="Lead actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsEditOpen(true)} className="cursor-pointer">
            <Pencil className="mr-2 h-4 w-4" />
            Edit Lead
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleConvert} className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 cursor-pointer">
            <Building className="mr-2 h-4 w-4" />
            Convert to Client
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Lead
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditLeadModal 
        isOpen={isEditOpen} 
        onClose={() => setIsEditOpen(false)} 
        workspaceId={workspaceId} 
        lead={lead} 
      />
    </>
  );
}
