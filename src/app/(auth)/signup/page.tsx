'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { signup, loginWithGoogle } from '@/actions/auth';
import { GoogleMark } from '@/components/auth/AuthVisualPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
      {children}
    </span>
  );
}

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signup, undefined);

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#dce9ff] px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute -left-20 top-0 size-96 rounded-full bg-[#c3c0ff]/35 blur-3xl" />
        <div className="absolute -bottom-28 right-0 size-[28rem] rounded-full bg-white/70 blur-3xl" />
        <div className="coldingrod-dot-grid absolute inset-0 opacity-20" />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        <header className="mb-8 text-center">
          <Link
            href="/login"
            className="text-4xl font-bold tracking-[-0.04em] text-black sm:text-5xl"
          >
            Coldingrod
          </Link>
          <p className="mt-3 text-base text-slate-700">Create your account</p>
        </header>

        <div className="coldingrod-card p-6 sm:p-10">
          <form action={formAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <div className="relative">
                <FieldIcon><UserRound className="size-5" /></FieldIcon>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  className="pl-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <FieldIcon><Mail className="size-5" /></FieldIcon>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jane@company.com"
                  className="pl-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <FieldIcon><LockKeyhole className="size-5" /></FieldIcon>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="pl-11"
                  minLength={8}
                  required
                />
              </div>
              <div className="grid grid-cols-4 gap-1" aria-hidden="true">
                <span className="h-1 rounded-full bg-brand-indigo" />
                <span className="h-1 rounded-full bg-[#d3e4fe]" />
                <span className="h-1 rounded-full bg-[#d3e4fe]" />
                <span className="h-1 rounded-full bg-[#d3e4fe]" />
              </div>
              <p className="text-right text-xs text-slate-500">Use 8+ characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <FieldIcon><LockKeyhole className="size-5" /></FieldIcon>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="pl-11"
                  minLength={8}
                  required
                />
              </div>
            </div>

            {state?.error && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Account could not be created</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            {state?.success && (
              <Alert>
                <AlertTitle>Check your email</AlertTitle>
                <AlertDescription>{state.success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isPending}>
              {isPending ? 'Creating account…' : 'Create account'}
              {!isPending && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-4" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="coldingrod-label">Or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form action={loginWithGoogle}>
            <Button variant="outline" type="submit" size="lg" className="w-full">
              <GoogleMark />
              Sign up with Google
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-indigo hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mx-auto mt-7 max-w-md text-center text-xs leading-5 tracking-wide text-slate-500">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-brand-navy">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-brand-navy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
