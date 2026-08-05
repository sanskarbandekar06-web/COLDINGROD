'use server';

import { redirect } from 'next/navigation';
import { getAppUrl } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';

export type PasswordActionState = {
  error?: string;
  success?: string;
} | null | undefined;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function requestPasswordReset(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const email = formValue(formData, 'email').toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };

  return {
    success:
      'If an account exists for that email, a password-reset link has been sent. Check your inbox and spam folder.',
  };
}

export async function updatePassword(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState | never> {
  const password = formValue(formData, 'password');
  const confirmPassword = formValue(formData, 'confirmPassword');
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your reset session has expired. Request a new link.' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect('/login?message=Password%20updated.%20Sign%20in%20with%20your%20new%20password.');
}
