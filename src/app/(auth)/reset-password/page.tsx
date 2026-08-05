'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { updatePassword } from '@/actions/password';
import { AuthVisualPanel, ColdingrodBrandMark } from '@/components/auth/AuthVisualPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <main className="flex min-h-svh overflow-hidden bg-brand-canvas">
      <AuthVisualPanel />
      <section className="relative flex min-h-svh w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="relative z-10 w-full max-w-md">
          <ColdingrodBrandMark className="mb-7" />
          <div className="coldingrod-card p-6 sm:p-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-indigo-soft text-brand-indigo">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-brand-navy">
              Choose a new password
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use at least eight characters and keep it unique to Coldingrod.
            </p>
            <form action={action} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              {state?.error && (
                <Alert variant="destructive"><AlertTitle>Password not updated</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Updating…' : 'Update password'}
              </Button>
            </form>
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Reset link expired? <Link href="/forgot-password" className="font-semibold text-brand-indigo hover:underline">Request another</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
