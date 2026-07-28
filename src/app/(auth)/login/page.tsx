'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { login, loginWithGoogle, resendSignupConfirmation } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, undefined);
  const [resendState, resendAction, isResending] = useActionState(
    resendSignupConfirmation,
    undefined,
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50/50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
          <CardDescription>
            Enter your email and password to access your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@agency.com"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>

            {state?.error && (
              <Alert variant="destructive">
                <AlertTitle>Unable to sign in</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {state?.emailNotConfirmed && state.email && (
            <form action={resendAction} className="mt-3">
              <input type="hidden" name="email" value={state.email} />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={isResending}
              >
                {isResending ? 'Sending...' : 'Resend confirmation email'}
              </Button>
            </form>
          )}

          {resendState?.success && (
            <Alert className="mt-3">
              <AlertTitle>Email sent</AlertTitle>
              <AlertDescription>{resendState.success}</AlertDescription>
            </Alert>
          )}

          {resendState?.error && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Email could not be sent</AlertTitle>
              <AlertDescription>{resendState.error}</AlertDescription>
            </Alert>
          )}

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <form action={loginWithGoogle}>
            <Button variant="outline" type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-medium text-blue-600 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
