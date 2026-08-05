'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAppUrl } from '@/lib/app-url';

export type AuthActionState = {
  error?: string;
  success?: string;
  email?: string;
  emailNotConfirmed?: boolean;
} | null | undefined;

function getEmailRedirectTo() {
  const appUrl = getAppUrl();
  return `${appUrl}/auth/callback?next=/dashboard`;
}

function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export async function login(prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const next = safeNextPath(formData.get('next'));

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
      return {
        error: 'Confirm your email address before signing in. Check your inbox and spam folder, or resend the confirmation email below.',
        email,
        emailNotConfirmed: true,
      };
    }

    return { error: error.message };
  }

  redirect(next);
}

export async function signup(prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const fullName = formData.get('fullName') as string;

  if (!email || !password || !fullName) {
    return { error: 'Email, password, and full name are required' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  if (confirmPassword && password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getEmailRedirectTo(),
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      success: 'Account created. Open the confirmation email we sent you, click “Confirm your email”, and then sign in.',
    };
  }

  redirect('/dashboard');
}

export async function resendSignupConfirmation(
  prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Enter your email address first.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getEmailRedirectTo(),
    },
  });

  if (error) {
    return { error: error.message, email };
  }

  return {
    success: 'Confirmation email sent. Check your inbox and spam folder.',
    email,
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function loginWithGoogle(_formData?: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${error.message}`);
  }

  if (data?.url) {
    redirect(data.url);
  }
}
