-- ==========================================
-- 008_security_advisor_hardening.sql
-- ==========================================

-- Supabase installs extensions in a dedicated schema to avoid polluting public.
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- Fix the function resolution path even for non-SECURITY-DEFINER trigger helpers.
ALTER FUNCTION public.check_invite_not_personal() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.validate_active_organizer() SET search_path = public;

-- Trigger functions are invoked by PostgreSQL triggers, never as PostgREST RPCs.
REVOKE ALL ON FUNCTION public.check_invite_not_personal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_active_organizer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_auth_user_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM PUBLIC, anon, authenticated;
