'use client';

import { useActionState } from 'react';
import { updateWorkspaceSettings, leaveWorkspace } from '@/actions/workspace';
import { Workspace } from '@/types/workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SectionCard } from '@/components/dashboard/SectionCard';

export function WorkspaceSettingsForm({ workspace, hasPermission }: { workspace: Workspace, hasPermission: boolean }) {
  const [state, formAction, isPending] = useActionState(updateWorkspaceSettings, null);

  return (
    <div className="space-y-6 max-w-4xl">
      <SectionCard title="General Settings" description="Manage your workspace identity.">
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          
          <div className="grid gap-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input 
              id="name" 
              name="name" 
              defaultValue={workspace.name} 
              disabled={!hasPermission || isPending}
              required 
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="slug">Workspace URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground bg-muted px-3 py-2 rounded-md border text-sm shrink-0">
                app.coldingrod.com/
              </span>
              <Input 
                id="slug" 
                name="slug" 
                defaultValue={workspace.slug} 
                disabled={!hasPermission || isPending}
                required 
              />
            </div>
            <p className="text-xs text-muted-foreground">Changing the slug will invalidate old links to your workspace.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="logo_url">Logo URL (Optional)</Label>
            <Input 
              id="logo_url" 
              name="logo_url" 
              defaultValue={workspace.logo_url || ''} 
              disabled={!hasPermission || isPending}
            />
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
              <AlertDescription>Workspace settings updated successfully.</AlertDescription>
            </Alert>
          )}

          {hasPermission && (
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Danger Zone" description="Irreversible actions for this workspace.">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Leave Workspace</h4>
            <p className="text-sm text-muted-foreground">Revoke your own access to this workspace.</p>
          </div>
          <form action={async () => {
             await leaveWorkspace(workspace.id);
          }}>
             <Button variant="destructive" type="submit">Leave Workspace</Button>
          </form>
        </div>
      </SectionCard>
    </div>
  );
}
