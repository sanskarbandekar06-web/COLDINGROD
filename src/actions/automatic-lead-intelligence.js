'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ensureAutomaticLeadIntelligence } from '@/services/automatic-lead-intelligence.service';
import { getWorkspaceContext } from '@/services/workspace.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function prepareAutomaticLeadIntelligenceAction(
  workspaceSlug,
  leadId,
) {
  const slug = String(workspaceSlug ?? '').trim();
  const normalizedLeadId = String(leadId ?? '').trim();
  if (!slug || slug.length > 120 || !UUID_PATTERN.test(normalizedLeadId)) {
    return { success: false, error: 'The workspace or lead is invalid.' };
  }

  const context = await getWorkspaceContext(slug);
  if (!context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')) {
    return {
      success: false,
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select(
      'id, workspace_id, company_name, source, website_url, industry, location, business_email, business_phone',
    )
    .eq('id', normalizedLeadId)
    .eq('workspace_id', context.workspace.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (leadError || !lead) {
    return { success: false, error: 'This lead is no longer available.' };
  }

  try {
    const result = await ensureAutomaticLeadIntelligence({
      supabase,
      workspaceId: context.workspace.id,
      lead,
      force: true,
    });
    const base = `/dashboard/${slug}`;
    revalidatePath(`${base}/leads/${normalizedLeadId}`);
    revalidatePath(`${base}/leads/${normalizedLeadId}/reports/summary`);
    revalidatePath(`${base}/leads/${normalizedLeadId}/reports/detailed`);
    revalidatePath(`${base}/leads`);
    revalidatePath(`${base}/outreach/messages`);
    revalidatePath(`${base}/ai`);
    revalidatePath(`${base}/ai/actions`);
    revalidatePath(`${base}/activity`);
    return {
      success: true,
      score: Number(result.qualification?.score ?? 0),
      confidence: Number(result.research?.confidence ?? 0),
      opportunityCount: Array.isArray(result.finalized?.pain_points)
        ? result.finalized.pain_points.length
        : 0,
      contactCount: result.contacts?.length ?? 0,
    };
  } catch (error) {
    console.error('Automatic lead intelligence failed:', error?.message);
    return {
      success: false,
      error: 'The AI agents could not complete public lead analysis. Try again shortly.',
    };
  }
}
