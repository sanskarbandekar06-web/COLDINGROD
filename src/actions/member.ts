'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface MemberActionResult {
  success?: boolean;
  error?: string;
}

interface WorkspaceManager {
  userId: string;
  memberId: string;
  workspaceSlug: string;
}

const INVITE_EXPIRATION_DAYS = new Set([1, 3, 7, 30]);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(email: string): boolean {
  return (
    email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

async function requireWorkspaceManager(
  supabase: SupabaseServerClient,
  workspaceId: string
): Promise<WorkspaceManager> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Not authenticated.');

  const [{ data: member, error: memberError }, { data: workspace, error: workspaceError }] =
    await Promise.all([
      supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('workspaces')
        .select('slug, is_personal')
        .eq('id', workspaceId)
        .is('deleted_at', null)
        .maybeSingle(),
    ]);

  if (memberError || !member || workspaceError || !workspace) {
    throw new Error('Active workspace membership is required.');
  }
  if (workspace.is_personal) {
    throw new Error('Personal workspaces cannot have additional members.');
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      check_workspace_id: workspaceId,
      req_permission: 'manage_members',
    }
  );
  if (permissionError || canManage !== true) {
    throw new Error('The manage_members permission is required.');
  }

  return {
    userId: user.id,
    memberId: member.id,
    workspaceSlug: workspace.slug,
  };
}

async function validatePermissionKeys(
  supabase: SupabaseServerClient,
  permissionKeys: string[]
): Promise<string[]> {
  const uniqueKeys = [...new Set(permissionKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) return [];

  const { data, error } = await supabase
    .from('permissions')
    .select('key')
    .in('key', uniqueKeys);
  if (error) throw new Error('Unable to validate invite permissions.');

  const validKeys = (data ?? [])
    .map((permission) => permission.key)
    .filter((key): key is string => typeof key === 'string');
  if (validKeys.length !== uniqueKeys.length) {
    throw new Error('One or more selected permissions are invalid.');
  }

  return uniqueKeys;
}

async function validatePermissionIds(
  supabase: SupabaseServerClient,
  permissionIds: string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(permissionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from('permissions')
    .select('id')
    .in('id', uniqueIds);
  if (error) throw new Error('Unable to validate member permissions.');

  const validIds = (data ?? [])
    .map((permission) => permission.id)
    .filter((id): id is string => typeof id === 'string');
  if (validIds.length !== uniqueIds.length) {
    throw new Error('One or more selected permissions are invalid.');
  }

  return uniqueIds;
}

function revalidateMembers(workspaceSlug: string): void {
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${workspaceSlug}/members`);
}

export async function inviteMember(
  _previousState: MemberActionResult | null | undefined,
  formData: FormData
): Promise<MemberActionResult> {
  try {
    const workspaceId = formString(formData, 'workspaceId');
    const email = formString(formData, 'email').toLowerCase();
    const expirationDays = Number.parseInt(formString(formData, 'expiration') || '7', 10);
    const requestedPermissions = formData
      .getAll('permissions')
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim());

    if (!workspaceId || !email) throw new Error('Email and workspace are required.');
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    if (!INVITE_EXPIRATION_DAYS.has(expirationDays)) {
      throw new Error('Select a supported invite expiration.');
    }

    const supabase = await createClient();
    const actor = await requireWorkspaceManager(supabase, workspaceId);
    const permissions = await validatePermissionKeys(supabase, requestedPermissions);

    const { data: existingInvite, error: existingInviteError } = await supabase
      .from('workspace_invites')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('email', email)
      .eq('status', 'pending')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (existingInviteError) throw new Error('Unable to check existing invitations.');
    if (existingInvite) {
      throw new Error('An active invitation already exists for this email address.');
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + expirationDays);
    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invites')
      .insert({
        workspace_id: workspaceId,
        email,
        token: randomBytes(32).toString('hex'),
        granted_permissions: permissions,
        invited_by: actor.userId,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();
    if (inviteError || !invite) throw new Error('Failed to create the invitation.');

    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'member_invite',
      entity_id: invite.id,
      actor_type: 'human',
      actor_user_id: actor.userId,
      workspace_member_id: actor.memberId,
      action: 'invited',
      metadata: { email },
    });
    if (activityError) {
      throw new Error('The invite was created, but its activity record failed.');
    }

    revalidateMembers(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Invite member error:', error);
    return { error: errorMessage(error, 'Failed to create the invitation.') };
  }
}

export async function acceptInvite(token: string): Promise<MemberActionResult | never> {
  const normalizedToken = token.trim();
  if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
    return { error: 'Invalid invitation token.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect('/login');

  const { data: workspaceId, error } = await supabase.rpc(
    'accept_workspace_invite',
    { invite_token: normalizedToken }
  );
  if (error || typeof workspaceId !== 'string') {
    console.error('Accept invite error:', error);
    return { error: error?.message || 'Invalid or expired invitation.' };
  }

  const [{ data: workspace }, { data: member }] = await Promise.all([
    supabase
      .from('workspaces')
      .select('slug')
      .eq('id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  if (member) {
    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'member',
      entity_id: member.id,
      actor_type: 'human',
      actor_user_id: user.id,
      workspace_member_id: member.id,
      action: 'joined',
    });
    if (activityError) console.error('Failed to record invite acceptance:', activityError);
  }

  revalidatePath('/dashboard');
  redirect(workspace ? `/dashboard/${workspace.slug}` : '/dashboard');
}

export async function updateMemberPermissions(
  workspaceId: string,
  memberId: string,
  permissionIds: string[]
): Promise<MemberActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireWorkspaceManager(supabase, workspaceId);
    const validatedPermissionIds = await validatePermissionIds(supabase, permissionIds);

    const { data: target, error: targetError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (targetError || !target) throw new Error('Active workspace member not found.');

    const { error: updateError } = await supabase.rpc(
      'set_workspace_member_permissions',
      {
        target_member_id: memberId,
        permission_ids: validatedPermissionIds,
      }
    );
    if (updateError) throw new Error(updateError.message || 'Failed to update permissions.');

    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'member_permissions',
      entity_id: memberId,
      actor_type: 'human',
      actor_user_id: actor.userId,
      workspace_member_id: actor.memberId,
      action: 'updated',
      metadata: { permission_count: validatedPermissionIds.length },
    });
    if (activityError) {
      throw new Error('Permissions were updated, but the activity record failed.');
    }

    revalidateMembers(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Update member permissions error:', error);
    return { error: errorMessage(error, 'Failed to update member permissions.') };
  }
}

export async function removeMember(
  workspaceId: string,
  memberId: string
): Promise<MemberActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireWorkspaceManager(supabase, workspaceId);

    const { data: target, error: targetError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (targetError || !target) throw new Error('Active workspace member not found.');
    if (memberId === actor.memberId) {
      throw new Error('You cannot remove your own workspace membership.');
    }

    const { error: removeError } = await supabase.rpc('remove_workspace_member', {
      target_member_id: memberId,
    });
    if (removeError) throw new Error(removeError.message || 'Failed to remove member.');

    const { error: activityError } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      entity_type: 'member',
      entity_id: memberId,
      actor_type: 'human',
      actor_user_id: actor.userId,
      workspace_member_id: actor.memberId,
      action: 'removed',
    });
    if (activityError) {
      throw new Error('The member was removed, but the activity record failed.');
    }

    revalidateMembers(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Remove member error:', error);
    return { error: errorMessage(error, 'Failed to remove member.') };
  }
}
