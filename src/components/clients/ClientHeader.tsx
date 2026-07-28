'use client';

import { Client } from '@/types/client';
import { Button } from '@/components/ui/button';
import { Settings, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { EditClientModal } from './EditClientModal';
import { useState } from 'react';
import { archiveClientAction } from '@/actions/clients';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ClientHeader({ client, workspaceId }: { client: Client; workspaceId: string }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const router = useRouter();

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this client?')) return;
    const res = await archiveClientAction(workspaceId, client.id);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success('Client archived');
      router.push(`/dashboard/${workspaceId}/clients`);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href={`/dashboard/${workspaceId}/clients`} className="hover:text-primary flex items-center">
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Clients
            </Link>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{client.name}</h2>
          <div className="flex gap-4 text-sm text-muted-foreground pt-1">
            {client.industry && <span>{client.industry}</span>}
            {client.website && (
              <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {client.website}
              </a>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="icon" type="button">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
              Edit Client
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive} className="text-rose-600 focus:text-rose-600">
              <Trash2 className="h-4 w-4 mr-2" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditClientModal 
        isOpen={isEditOpen} 
        onClose={() => setIsEditOpen(false)} 
        workspaceId={workspaceId} 
        client={client} 
      />
    </>
  );
}
