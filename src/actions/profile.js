'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_LOCALES = new Set(['en-IN', 'en-US', 'en-GB']);

function field(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function updatePersonalProfile(formData) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { success: false, error: 'Please sign in again.' };

  const fullName = field(formData, 'full_name');
  const jobTitle = field(formData, 'job_title');
  const timezone = field(formData, 'timezone') || 'UTC';
  const locale = field(formData, 'locale') || 'en-IN';
  const avatarUrl = field(formData, 'avatar_url');
  const avatarPath = field(formData, 'avatar_path');

  if (fullName.length < 2 || fullName.length > 80) {
    return { success: false, error: 'Full name must be between 2 and 80 characters.' };
  }
  if (jobTitle.length > 80) {
    return { success: false, error: 'Role must be 80 characters or fewer.' };
  }
  if (!isValidTimezone(timezone)) {
    return { success: false, error: 'Choose a valid timezone.' };
  }
  if (!ALLOWED_LOCALES.has(locale)) {
    return { success: false, error: 'Choose a supported language and region.' };
  }
  if (avatarPath && !avatarPath.startsWith(`${user.id}/`)) {
    return { success: false, error: 'That profile picture does not belong to your account.' };
  }
  if (avatarUrl) {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== 'https:') throw new Error('invalid protocol');
    } catch {
      return { success: false, error: 'Profile picture URL is invalid.' };
    }
  }

  const profile = {
    full_name: fullName,
    job_title: jobTitle || null,
    timezone,
    locale,
    email_notifications: formData.get('email_notifications') === 'on',
    product_updates: formData.get('product_updates') === 'on',
    ai_assistance_enabled: formData.get('ai_assistance_enabled') === 'on',
    avatar_url: avatarUrl || null,
    avatar_path: avatarPath || null,
  };

  const { error } = await supabase.from('users').update(profile).eq('id', user.id);
  if (error) {
    console.error('Profile update failed:', error);
    return { success: false, error: 'Your profile could not be saved.' };
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      name: fullName,
      avatar_url: avatarUrl || null,
    },
  });
  if (metadataError) console.error('Auth profile metadata sync failed:', metadataError);

  revalidatePath('/', 'layout');
  return { success: true, profile };
}