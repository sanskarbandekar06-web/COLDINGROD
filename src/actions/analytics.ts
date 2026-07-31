'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';

export type RunAnalyticsResult =
  | { success: true; snapshotId: string; actionId: string }
  | {
      success: false;
      code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'EXECUTION_FAILED';
      error: string;
    };

export async function runWorkspaceAnalyticsAction(
  workspaceSlug: string,
  periodDays: number,
): Promise<RunAnalyticsResult> {
  const normalizedSlug = workspaceSlug.trim();
  if (
    normalizedSlug.length === 0 ||
    normalizedSlug.length > 120 ||
    ![7, 30, 90].includes(periodDays)
  ) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Choose a valid 7, 30, or 90 day period.',
    };
  }

  const context = await getWorkspaceContext(normalizedSlug);
  if (
    !context ||
    !context.permissions.includes('manage_ai') ||
    !context.permissions.includes('manage_leads')
  ) {
    return {
      success: false,
      code: 'UNAUTHORIZED',
      error: 'AI and lead management permissions are required.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('run_workspace_analytics', {
      check_workspace_id: context.workspace.id,
      check_period_days: periodDays,
    })
    .single();

  if (error) {
    console.error('Workspace analytics failed:', error.message);
    return {
      success: false,
      code:
        error.code === '42501' ? 'UNAUTHORIZED' : 'EXECUTION_FAILED',
      error:
        error.code === '42501'
          ? 'You no longer have permission to run analytics.'
          : 'The analytics snapshot could not be generated.',
    };
  }

  const result = data as unknown as {
    snapshot_id: string;
    action_id: string;
  };
  const base = `/dashboard/${normalizedSlug}`;
  revalidatePath(`${base}/ai/analytics`);
  revalidatePath(`${base}/ai`);
  revalidatePath(`${base}/ai/actions`);
  revalidatePath(`${base}/activity`);

  return {
    success: true,
    snapshotId: result.snapshot_id,
    actionId: result.action_id,
  };
}
