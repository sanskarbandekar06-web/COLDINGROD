'use client';

import { useActionState, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { createCompanyWorkspaceAction } from '@/actions/workspace';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeWorkspaceSlug } from '@/lib/workspace-slug';

export function CreateWorkspaceWizard() {
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createCompanyWorkspaceAction,
    null,
  );

  const handleNext = () => {
    const fieldId = step === 1 ? 'name' : step === 2 ? 'slug' : null;
    const field = fieldId
      ? formRef.current?.querySelector<HTMLInputElement>(`#${fieldId}`)
      : null;

    if (field && !field.reportValidity()) return;
    setStep((currentStep) => Math.min(4, currentStep + 1));
  };

  const handlePrev = () =>
    setStep((currentStep) => Math.max(1, currentStep - 1));

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    if (!slugEdited) setSlug(normalizeWorkspaceSlug(value));
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mx-auto w-full max-w-md"
    >
      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle>Create Company Workspace</CardTitle>
          <CardDescription>
            {step === 1 && 'What is the name of your company?'}
            {step === 2 && 'Choose a URL slug for your workspace.'}
            {step === 3 && 'Tell us a bit about your company.'}
            {step === 4 && 'Review and create your workspace.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={step === 1 ? 'block' : 'hidden'}>
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                name="name"
                value={companyName}
                onChange={(event) =>
                  handleCompanyNameChange(event.target.value)
                }
                placeholder="Acme Corp"
                required={step === 1}
                maxLength={100}
              />
            </div>
          </div>

          <div className={step === 2 ? 'block' : 'hidden'}>
            <div className="grid gap-2">
              <Label htmlFor="slug">Workspace Slug</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  app.coldingrod.com/
                </span>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(normalizeWorkspaceSlug(event.target.value));
                  }}
                  placeholder="game-of-growth"
                  required={step === 2}
                  minLength={2}
                  maxLength={63}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="workspace-slug-help"
                />
              </div>
              <p
                id="workspace-slug-help"
                className="text-xs text-muted-foreground"
              >
                Use lowercase letters, numbers, and hyphens. Do not enter a
                website URL.
              </p>
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
                <Input
                  id="country"
                  name="country"
                  placeholder="United States"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    name="timezone"
                    placeholder="America/New_York"
                  />
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
              Click create to finalize setting up your new company workspace.
              You will be automatically redirected to your new dashboard.
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
          <Button
            type="button"
            variant="outline"
            onClick={handlePrev}
            disabled={step === 1 || isPending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          {step < 4 ? (
            <Button type="button" onClick={handleNext}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
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
