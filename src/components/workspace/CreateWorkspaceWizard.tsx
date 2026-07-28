'use client';

import { useActionState, useState } from 'react';
import { createCompanyWorkspaceAction } from '@/actions/workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function CreateWorkspaceWizard() {
  const [step, setStep] = useState(1);
  const [state, formAction, isPending] = useActionState(createCompanyWorkspaceAction, null);

  const handleNext = () => setStep(s => Math.min(4, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  return (
    <form action={formAction} className="w-full max-w-md mx-auto">
      <Card className="shadow-lg border-primary/10">
        <CardHeader>
          <CardTitle>Create Company Workspace</CardTitle>
          <CardDescription>
            {step === 1 && "What is the name of your company?"}
            {step === 2 && "Choose a URL slug for your workspace."}
            {step === 3 && "Tell us a bit about your company."}
            {step === 4 && "Review and create your workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={step === 1 ? 'block' : 'hidden'}>
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name</Label>
              <Input id="name" name="name" placeholder="Acme Corp" required={step === 1} />
            </div>
          </div>

          <div className={step === 2 ? 'block' : 'hidden'}>
            <div className="grid gap-2">
              <Label htmlFor="slug">Workspace Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground bg-muted px-3 py-2 rounded-md border text-sm shrink-0">
                  app.coldingrod.com/
                </span>
                <Input id="slug" name="slug" placeholder="acme" required={step === 2} />
              </div>
            </div>
          </div>

          <div className={step === 3 ? 'block' : 'hidden'}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" name="industry" placeholder="Software" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" name="country" placeholder="United States" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" name="timezone" placeholder="America/New_York" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" name="currency" placeholder="USD" />
                </div>
              </div>
            </div>
          </div>

          <div className={step === 4 ? 'block' : 'hidden'}>
             <p className="text-sm text-muted-foreground">
               Click create to finalize setting up your new company workspace. You will be automatically redirected to your new dashboard.
             </p>
          </div>

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={handlePrev} disabled={step === 1 || isPending}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          
          {step < 4 ? (
            <Button type="button" onClick={handleNext}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Workspace'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
