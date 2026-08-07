import 'server-only';

import { createClient } from '@/lib/supabase/server';

export async function getBrowserExtensionConnections(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('browser_extension_connections')
    .select(
      'id, device_name, created_at, expires_at, last_used_at, revoked_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Browser companion connections failed:', error.message);
    return [];
  }
  const now = Date.now();
  return (data ?? []).map((connection) => ({
    ...connection,
    is_active:
      !connection.revoked_at &&
      new Date(connection.expires_at).getTime() > now,
  }));
}
