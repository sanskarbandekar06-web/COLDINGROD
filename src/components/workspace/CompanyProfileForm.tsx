'use client';

import { useActionState } from 'react';
import { updateCompanyProfile } from '@/actions/workspace';
import { Workspace } from '@/types/workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SectionCard } from '@/components/dashboard/SectionCard';

export function CompanyProfileForm({ 
  workspace, 
  companyData,
  hasPermission 
}: { 
  workspace: Workspace;
  companyData: any;
  hasPermission: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateCompanyProfile, null);

  return (
    <SectionCard title="Company Profile" description="Manage your company details, billing info, and location.">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="workspaceId" value={workspace.id} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="grid gap-2">
            <Label htmlFor="legal_name">Legal Name</Label>
            <Input 
              id="legal_name" 
              name="legal_name" 
              defaultValue={companyData?.legal_name || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="industry">Industry</Label>
            <Input 
              id="industry" 
              name="industry" 
              defaultValue={workspace.industry || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="country">Country</Label>
            <Input 
              id="country" 
              name="country" 
              defaultValue={workspace.country || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input 
              id="timezone" 
              name="timezone" 
              defaultValue={workspace.timezone || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Input 
              id="currency" 
              name="currency" 
              defaultValue={workspace.currency || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="website">Website</Label>
            <Input 
              id="website" 
              name="website" 
              defaultValue={companyData?.website || ''} 
              disabled={!hasPermission || isPending}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input 
              id="address" 
              name="address" 
              defaultValue={companyData?.address || ''} 
              disabled={!hasPermission || isPending}
            />
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
            <AlertDescription>Company profile updated successfully.</AlertDescription>
          </Alert>
        )}

        {hasPermission && (
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        )}
      </form>
    </SectionCard>
  );
}
