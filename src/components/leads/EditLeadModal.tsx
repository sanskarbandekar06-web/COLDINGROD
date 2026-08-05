'use client';

import { useActionState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { updateLead } from '@/actions/lead';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LeadStatus } from '@/types/lead';

export function EditLeadModal({ isOpen, onClose, workspaceId, lead, members }: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  lead: { id: string; company_name: string; source: string | null; status: LeadStatus; assigned_to: string | null };
  members: { id: string; full_name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(updateLead.bind(null, workspaceId, lead.id), null);

  useEffect(() => {
    if (!state?.success) return;
    const timer = setTimeout(onClose, 800);
    return () => clearTimeout(timer);
  }, [state, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Update the lead identity, source, and owner.</DialogDescription></DialogHeader>
        <form action={formAction} className="space-y-5 pt-4">
          <input type="hidden" name="status" value={lead.status} />
          <div className="grid gap-2"><Label htmlFor="edit-lead-company">Company name</Label><Input id="edit-lead-company" name="companyName" defaultValue={lead.company_name} maxLength={200} required /></div>
          <div className="grid gap-2"><Label htmlFor="edit-lead-source">Lead source</Label><Input id="edit-lead-source" name="source" defaultValue={lead.source || ''} maxLength={200} placeholder="Website, referral, cold email…" /></div>
          <div className="grid gap-2">
            <Label htmlFor="edit-lead-assignee">Assigned to</Label>
            <select id="edit-lead-assignee" name="assignedTo" defaultValue={lead.assigned_to || 'unassigned'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <option value="unassigned">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
            </select>
          </div>
          {state?.error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Could not update lead</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>}
          {state?.success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertTitle>Lead updated</AlertTitle><AlertDescription>Your changes were saved.</AlertDescription></Alert>}
          <div className="flex justify-end gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={isPending || Boolean(state?.success)}>{isPending ? 'Saving…' : 'Save changes'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
