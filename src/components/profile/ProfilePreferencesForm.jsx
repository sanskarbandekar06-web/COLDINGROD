'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { updatePersonalProfile } from '@/actions/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function initials(name, email) {
  return (name || email || 'User')
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function ProfilePreferencesForm({ profile, workspaceSlug }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(profile.avatar_url || '');
  const [currentAvatarPath, setCurrentAvatarPath] = useState(profile.avatar_path || '');

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const shownAvatar = previewUrl || (!avatarRemoved ? currentAvatar : '');

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!AVATAR_TYPES.has(file.type)) {
      toast.error('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error('Profile pictures must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAvatarRemoved(false);
    setSaved(false);
  }

  function removeAvatar() {
    setSelectedFile(null);
    setPreviewUrl('');
    setAvatarRemoved(true);
    setSaved(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submitProfile(event) {
    event.preventDefault();
    setPending(true);
    setSaved(false);

    const formData = new FormData(event.currentTarget);
    let uploadedPath = '';
    let avatarUrl = avatarRemoved ? '' : currentAvatar;
    let avatarPath = avatarRemoved ? '' : currentAvatarPath;

    try {
      if (selectedFile) {
        const extension = AVATAR_TYPES.get(selectedFile.type);
        uploadedPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(uploadedPath, selectedFile, {
            cacheControl: '3600',
            contentType: selectedFile.type,
            upsert: false,
          });
        if (uploadError) throw new Error(uploadError.message);

        avatarPath = uploadedPath;
        avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      }

      formData.set('avatar_url', avatarUrl);
      formData.set('avatar_path', avatarPath);
      formData.set('workspace_slug', workspaceSlug);
      const result = await updatePersonalProfile(formData);

      if (!result.success) {
        if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
        toast.error(result.error || 'Your profile could not be saved.');
        return;
      }

      if (currentAvatarPath && currentAvatarPath !== avatarPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([currentAvatarPath]);
      }
      setCurrentAvatar(avatarUrl);
      setCurrentAvatarPath(avatarPath);
      setSelectedFile(null);
      setPreviewUrl('');
      setAvatarRemoved(false);
      if (fileInput.current) fileInput.current.value = '';
      setSaved(true);
      toast.success('Personal profile updated.');
      router.refresh();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      toast.error(error instanceof Error ? error.message : 'Profile picture upload failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submitProfile} className="space-y-6">
      <section id="overview" className="coldingrod-card scroll-mt-24 overflow-hidden">
        <div className="border-b px-5 py-5 sm:px-6">
          <h2 className="text-xl font-semibold text-brand-navy">Profile Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your basic profile information and identity.
          </p>
        </div>
        <div className="grid gap-7 p-5 sm:p-6 md:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="group relative rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-indigo"
              aria-label="Choose profile picture"
              disabled={pending}
            >
              <Avatar className="size-24 border-2 border-brand-blue-soft shadow-sm after:border-transparent">
                {shownAvatar && <AvatarImage src={shownAvatar} alt="Profile preview" />}
                <AvatarFallback className="bg-brand-indigo-soft text-xl font-bold text-brand-indigo">
                  {initials(profile.full_name, profile.email)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-navy/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="size-5" />
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={chooseAvatar}
              disabled={pending}
            />
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={pending}>
                <Upload className="size-3.5" /> Upload
              </Button>
              {(shownAvatar || currentAvatar) && (
                <Button type="button" size="sm" variant="ghost" onClick={removeAvatar} disabled={pending} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">JPG, PNG, or WebP. Max 2 MB.</p>
          </div>

          <div className="grid content-start gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-full-name">Full Name</Label>
              <Input id="profile-full-name" name="full_name" defaultValue={profile.full_name || ''} minLength={2} maxLength={80} required disabled={pending} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-email">Email Address</Label>
              <Input id="profile-email" type="email" value={profile.email} readOnly disabled className="disabled:opacity-75" />
              <p className="text-xs text-muted-foreground">Your sign-in email is managed by Supabase Auth.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-role">Role</Label>
              <Input id="profile-role" name="job_title" defaultValue={profile.job_title || ''} maxLength={80} placeholder="Founder, Designer, Sales Lead…" disabled={pending} />
            </div>
            <div className="grid gap-2">
              <Label>Account Status</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm">
                <span className="size-2 rounded-full bg-emerald-500" /> Active
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="preferences" className="coldingrod-card scroll-mt-24 overflow-hidden">
        <div className="border-b px-5 py-5 sm:px-6">
          <h2 className="text-xl font-semibold text-brand-navy">Personal Preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose how dates, time, and language appear for your account.</p>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div className="grid gap-2">
            <Label htmlFor="profile-timezone">Timezone</Label>
            <select id="profile-timezone" name="timezone" defaultValue={profile.timezone || 'UTC'} disabled={pending} className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="Asia/Kolkata">India Standard Time (Asia/Kolkata)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (New York)</option>
              <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
              <option value="Europe/London">United Kingdom (London)</option>
              <option value="Asia/Dubai">Gulf Time (Dubai)</option>
              <option value="Asia/Singapore">Singapore</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-locale">Language & Region</Label>
            <select id="profile-locale" name="locale" defaultValue={profile.locale || 'en-IN'} disabled={pending} className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </div>
        </div>
      </section>

      <section id="communication" className="coldingrod-card scroll-mt-24 overflow-hidden">
        <div className="border-b px-5 py-5 sm:px-6">
          <h2 className="text-xl font-semibold text-brand-navy">Communication & AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">Control account-level notifications and assistance.</p>
        </div>
        <div className="divide-y px-5 sm:px-6">
          {[
            ['email_notifications', 'Email notifications', 'Important activity, assignments, invitations, and approvals.', profile.email_notifications],
            ['product_updates', 'Product updates', 'Occasional Coldingrod feature and release announcements.', profile.product_updates],
            ['ai_assistance_enabled', 'AI assistance', 'Show AI recommendations and assistant entry points for your account.', profile.ai_assistance_enabled],
          ].map(([name, label, description, checked]) => (
            <label key={name} className="flex cursor-pointer items-start gap-3 py-4">
              <input type="checkbox" name={name} defaultChecked={Boolean(checked)} disabled={pending} className="mt-1 size-4 rounded border-input accent-brand-indigo" />
              <span>
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        {saved && (
          <span className="mr-auto flex items-center gap-2 text-sm font-medium text-emerald-700" role="status">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}