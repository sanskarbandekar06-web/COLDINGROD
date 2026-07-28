import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/outreach/contacts?leadId=...&workspaceId=...
 *
 * Validates:
 * 1. User is authenticated
 * 2. workspaceId matches the lead's workspace_id (prevents cross-workspace leakage)
 * 3. leadId belongs to the workspace
 *
 * Returns minimal contact fields — no sensitive data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const leadId = searchParams.get('leadId')?.trim();
  const workspaceId = searchParams.get('workspaceId')?.trim();

  if (!leadId || !workspaceId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate lead belongs to the workspace
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Validate user is a member of this workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: contacts } = await supabase
    .from('lead_contacts')
    .select(
      'id, first_name, last_name, email, phone, linkedin_url, instagram_handle'
    )
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false });

  return NextResponse.json(contacts ?? []);
}
