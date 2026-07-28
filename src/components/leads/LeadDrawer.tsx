'use client';

import { useEffect, useState } from 'react';
import { getLeadDrawerData } from '@/actions/lead-drawer';
import { Lead } from '@/types/lead';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import Link from 'next/link';

export function LeadDrawer({
  isOpen,
  onClose,
  workspaceId,
  leadId
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  leadId: string | null;
}) {
  const [data, setData] = useState<{ lead: any, contacts: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && leadId) {
      setLoading(true);
      getLeadDrawerData(workspaceId, leadId).then((res) => {
        setData(res);
        setLoading(false);
      });
    } else {
      setData(null);
    }
  }, [isOpen, leadId, workspaceId]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl flex items-center gap-2">
            {loading ? 'Loading...' : data?.lead?.company_name}
            {data?.lead && (
               <Badge variant="outline" className="capitalize text-xs font-normal">
                 {data.lead.status.replace('_', ' ')}
               </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {data?.lead?.source || 'Unknown Source'}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
            Loading lead details...
          </div>
        ) : data?.lead ? (
          <div className="mt-6 space-y-6">
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">Contacts</h4>
              {data.contacts.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded p-3 bg-muted/20">No contacts</div>
              ) : (
                <div className="grid gap-2">
                  {data.contacts.map((c) => (
                    <div key={c.id} className="text-sm border rounded-lg p-3 bg-card flex flex-col gap-1">
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      {c.email && <div className="text-muted-foreground flex items-center gap-2"><Mail className="h-3 w-3" /> {c.email}</div>}
                      {c.phone && <div className="text-muted-foreground flex items-center gap-2"><Phone className="h-3 w-3" /> {c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
               <h4 className="text-sm font-medium text-muted-foreground uppercase">Assigned To</h4>
               <div className="text-sm">
                 {data.lead.assigned_user?.full_name || 'Unassigned'}
               </div>
            </div>

            <div className="pt-6 border-t flex flex-col gap-3">
              <Button className="w-full" onClick={() => window.location.href = `/dashboard/${workspaceId}/leads/${leadId}`}>
                View Full Details <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
