'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight, KeyRound } from 'lucide-react';
import { login, loginWithGoogle, resendSignupConfirmation } from '@/actions/auth';
import { AuthTrustNote, AuthVisualPanel, ColdingrodBrandMark, GoogleMark } from '@/components/auth/AuthVisualPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, undefined);
  const [resendState, resendAction, isResending] = useActionState(
    resendSignupConfirmation,
    undefined,
  );

  return (
    <main className="flex min-h-svh overflow-hidden bg-brand-canvas">
      <AuthVisualPanel />

      <section className="relative flex min-h-svh w-full items-center justify-center overflow-y-auto px-4 py-10 sm:px-8 lg:w-1/2 lg:px-12">
        <div aria-hidden="true" className="coldingrod-dot-grid absolute inset-0 opacity-25" />

        <div className="relative z-10 w-full max-w-md">
          <header className="mb-8 text-center">
            <ColdingrodBrandMark className="mb-6" />
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy sm:text-4xl">
              Welcome to Coldingrod
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Log in to your Business OS to continue.
            </p>
          </header>

          <div className="coldingrod-card p-6 sm:p-8">
            <form action={formAction} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-brand-indigo hover:text-brand-indigo-strong hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {state?.error && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Unable to sign in</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={isPending}>
                {isPending ? 'Signing in…' : 'Sign in'}
                {!isPending && <ArrowRight className="size-4" />}
              </Button>
            </form>

            {state?.emailNotConfirmed && state.email && (
              <form action={resendAction} className="mt-3">
                <input type="hidden" name="email" value={state.email} />
                <Button
                  type="submit"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={isResending}
                >
                  {isResending ? 'Sending…' : 'Resend confirmation email'}
                </Button>
              </form>
            )}

            {resendState?.success && (
              <Alert className="mt-4">
                <AlertTitle>Email sent</AlertTitle>
                <AlertDescription>{resendState.success}</AlertDescription>
              </Alert>
            )}

            {resendState?.error && (
              <Alert variant="destructive" className="mt-4" role="alert">
                <AlertTitle>Email could not be sent</AlertTitle>
                <AlertDescription>{resendState.error}</AlertDescription>
              </Alert>
            )}

            <div className="my-6 flex items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="coldingrod-label">Or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form action={loginWithGoogle}>
              <Button variant="outline" type="submit" size="lg" className="w-full">
                <GoogleMark />
                Continue with Google
              </Button>
            </form>

            <div className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              <KeyRound className="size-4" />
              Enterprise SSO coming later
            </div>

            <AuthTrustNote />
          </div>

          <footer className="mt-7 text-center">
            <p className="text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-semibold text-brand-indigo hover:underline">
                Sign up
              </Link>
            </p>
            <div className="mt-5 flex items-center justify-center gap-3 text-xs font-medium tracking-wide text-slate-500">
              <Link href="/privacy" className="hover:text-brand-navy">Privacy Policy</Link>
              <span aria-hidden="true">·</span>
              <Link href="/terms" className="hover:text-brand-navy">Terms of Use</Link>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
