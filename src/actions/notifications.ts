'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/services/workspace.service';
import type { NotificationActionResult } from '@/types/notification';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refreshNotifications(workspaceSlug: string) {
  revalidatePath(`/dashboard/${workspaceSlug}`, 'layout');
  revalidatePath(`/dashboard/${workspaceSlug}/activity`, 'page');
}

export async function setNotificationReadAction(
  workspaceSlug: string,
  notificationId: string,
  isRead: boolean,
): Promise<NotificationActionResult> {
  if (!UUID_PATTERN.test(notificationId)) {
    return { success: false, error: 'Notification is invalid.' };
  }

  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) return { success: false, error: 'Workspace not found.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .update({
      is_read: isRead,
      read_at: isRead ? new Date().toISOString() : null,
    })
    .eq('id', notificationId)
    .eq('workspace_id', context.workspace.id)
    .eq('workspace_member_id', context.member.id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Update notification error:', error);
    return { success: false, error: 'Unable to update the notification.' };
  }
  if (!data) return { success: false, error: 'Notification not found.' };

  refreshNotifications(workspaceSlug);
  return { success: true };
}

export async function markAllNotificationsReadAction(
  workspaceSlug: string,
): Promise<NotificationActionResult> {
  const context = await getWorkspaceContext(workspaceSlug);
  if (!context) return { success: false, error: 'Workspace not found.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('workspace_id', context.workspace.id)
    .eq('workspace_member_id', context.member.id)
    .eq('is_read', false);

  if (error) {
    console.error('Mark all notifications error:', error);
    return { success: false, error: 'Unable to mark notifications as read.' };
  }

  refreshNotifications(workspaceSlug);
  return { success: true };
}