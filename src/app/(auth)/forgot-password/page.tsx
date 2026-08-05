'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { requestPasswordReset } from '@/actions/password';
import { AuthVisualPanel, ColdingrodBrandMark } from '@/components/auth/AuthVisualPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <main className="flex min-h-svh overflow-hidden bg-brand-canvas">
      <AuthVisualPanel />
      <section className="relative flex min-h-svh w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="relative z-10 w-full max-w-md">
          <ColdingrodBrandMark className="mb-7" />
          <div className="coldingrod-card p-6 sm:p-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-indigo-soft text-brand-indigo">
              <Mail className="size-5" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-brand-navy">
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your account email and we will send you a secure reset link.
            </p>
            <form action={action} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              {state?.error && (
                <Alert variant="destructive"><AlertTitle>Could not send link</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>
              )}
              {state?.success && (
                <Alert><AlertTitle>Check your email</AlertTitle><AlertDescription>{state.success}</AlertDescription></Alert>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <Link href="/login" className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
              <ArrowLeft className="size-4" /> Back to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
