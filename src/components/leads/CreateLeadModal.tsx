'use client';

import { useActionState, useEffect } from 'react';
import { createLead } from '@/actions/lead';
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

export function CreateLeadModal({
  isOpen,
  onClose,
  workspaceId
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createLead.bind(null, workspaceId), 
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
          <DialogDescription>
            Add a new lead to your pipeline. You can add more details later.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6 pt-4">
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Company Details</h4>
            
            <div className="grid gap-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input id="companyName" name="companyName" placeholder="Acme Corp" required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="source">Lead Source</Label>
              <Input id="source" name="source" placeholder="Website, Referral, Cold Email, etc." />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Primary Contact (Optional)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" placeholder="John" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" placeholder="Doe" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="john@acme.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 000-0000" />
              </div>
            </div>
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
              <AlertDescription>Lead created successfully.</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || state?.success}>
              {isPending ? 'Saving...' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
