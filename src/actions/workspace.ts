'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function updateWorkspaceSettings(prevState: { error?: string, success?: boolean } | null | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const workspaceId = formData.get('workspaceId') as string;
  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const logoUrl = formData.get('logo_url') as string;

  if (!workspaceId || !name || !slug) return { error: 'Missing required fields' };

  // Update logic with permission check enforced by RLS
  const { error } = await supabase
    .from('workspaces')
    .update({ name, slug, logo_url: logoUrl })
    .eq('id', workspaceId);

  if (error) {
    console.error('Error updating workspace:', error);
    if (error.code === '23505') {
      return { error: 'Workspace slug is already taken.' };
    }
    return { error: 'Failed to update workspace settings.' };
  }

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function updateCompanyProfile(prevState: { error?: string, success?: boolean } | null | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const workspaceId = formData.get('workspaceId') as string;
  
  // Workspaces table fields
  const industry = formData.get('industry') as string;
  const timezone = formData.get('timezone') as string;
  const country = formData.get('country') as string;
  const currency = formData.get('currency') as string;

  // Companies table fields
  const legalName = formData.get('legal_name') as string;
  const website = formData.get('website') as string;
  const address = formData.get('address') as string;

  // Update Workspaces
  const { error: wsError } = await supabase
    .from('workspaces')
    .update({ industry, timezone, country, currency })
    .eq('id', workspaceId);

  if (wsError) return { error: 'Failed to update workspace details.' };

  // Upsert Companies
  const { error: coError } = await supabase
    .from('companies')
    .upsert({ 
      workspace_id: workspaceId,
      legal_name: legalName,
      website: website,
      address: address
    }, { onConflict: 'workspace_id' });

  if (coError) return { error: 'Failed to update company profile.' };

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function leaveWorkspace(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check if owner
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('created_by')
    .eq('id', workspaceId)
    .single();

  if (workspace?.created_by === user.id) {
    throw new Error('Workspace owners cannot leave their own workspace. Transfer ownership or delete it instead.');
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Leave workspace error:', error);
    throw new Error('Failed to leave workspace');
  }

  // Generate Activity
  await supabase.from('activities').insert({
    workspace_id: workspaceId,
    entity_type: 'member',
    entity_id: user.id,
    actor_type: 'human',
    actor_user_id: user.id,
    action: 'left'
  });

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function createCompanyWorkspaceAction(prevState: { error?: string, success?: boolean } | null | undefined, formData: FormData) {
  const supabase = await createClient();
  
  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const industry = formData.get('industry') as string;
  const country = formData.get('country') as string;
  const timezone = formData.get('timezone') as string;
  const currency = formData.get('currency') as string;

  if (!name || !slug) return { error: 'Name and Slug are required' };

  // Call the RPC
  const { data: workspaceId, error: rpcError } = await supabase
    .rpc('create_company_workspace', {
      workspace_name: name,
      workspace_slug: slug
    });

  if (rpcError || !workspaceId) {
    if (rpcError?.code === '23505') return { error: 'Slug is already in use.' };
    return { error: rpcError?.message || 'Failed to create workspace' };
  }

  // Update additional fields
  await supabase
    .from('workspaces')
    .update({ industry, country, timezone, currency })
    .eq('id', workspaceId);

  revalidatePath('/dashboard');
  redirect(`/dashboard/${slug}`);
}
