-- ==========================================
-- 012_notification_column_grants.sql
-- Hosted default privileges expose new public tables broadly. Keep notification
-- identity and delivery server-owned; authenticated users may only read rows
-- allowed by RLS and update the two read-state columns.
-- ==========================================

REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM authenticated;

GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON TABLE public.notifications TO authenticated;