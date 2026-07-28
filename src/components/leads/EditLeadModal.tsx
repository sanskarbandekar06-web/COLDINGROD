'use client';

import { useActionState, useEffect } from 'react';
import { updateLead } from '@/actions/lead';
import { LeadStatus } from '@/types/lead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function EditLeadModal({
  isOpen,
  onClose,
  workspaceId,
  lead
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  lead: {
    id: string;
    company_name: string;
    source: string | null;
    status: LeadStatus;
  };
}) {
  const [state, formAction, isPending] = useActionState(
    updateLead.bind(null, workspaceId, lead.id), 
    null
  );

  useEffect(() => {
    if (state?.success) {
       const timer = setTimeout(() => {
          onClose();
       }, 1500);
       return () => clearTimeout(timer);
    }
  }, [state, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>
            Update the primary details for this lead.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6 pt-4">
          <input type="hidden" name="status" value={lead.status} />
          
          <div className="grid gap-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input id="companyName" name="companyName" defaultValue={lead.company_name} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="source">Lead Source</Label>
            <Input id="source" name="source" defaultValue={lead.source || ''} placeholder="Website, Referral, Cold Email, etc." />
          </div>

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {state?.success && (
            <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Lead updated successfully.</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || state?.success}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
