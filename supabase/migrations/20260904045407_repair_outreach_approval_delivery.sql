-- Ensure every web or Browser Companion approval moves its linked outreach
-- message into the delivery-ready state. This also repairs older approvals
-- that were recorded while the status-sync trigger was absent or stale.

CREATE OR REPLACE FUNCTION public.browser_extension_sync_outreach_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.entity_type = 'outreach_message'
       AND NEW.entity_id IS NOT NULL
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved', 'rejected')
    THEN
        UPDATE public.outreach_messages message
        SET status = CASE
                WHEN NEW.status = 'approved'
                THEN 'scheduled'::public.outreach_status
                ELSE 'failed'::public.outreach_status
            END,
            updated_at = clock_timestamp()
        WHERE message.id = NEW.entity_id
          AND message.workspace_id = NEW.workspace_id
          AND message.ai_action_id = NEW.id
          AND message.status = 'pending_approval'
          AND message.deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.browser_extension_sync_outreach_status()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_browser_extension_outreach_status
ON public.ai_actions;
CREATE TRIGGER sync_browser_extension_outreach_status
AFTER UPDATE OF status ON public.ai_actions
FOR EACH ROW
EXECUTE FUNCTION public.browser_extension_sync_outreach_status();

UPDATE public.outreach_messages message
SET status = CASE
        WHEN action.status = 'approved'
        THEN 'scheduled'::public.outreach_status
        ELSE 'failed'::public.outreach_status
    END,
    updated_at = clock_timestamp()
FROM public.ai_actions action
JOIN public.ai_approvals approval
  ON approval.ai_action_id = action.id
 AND approval.workspace_id = action.workspace_id
WHERE message.ai_action_id = action.id
  AND message.workspace_id = action.workspace_id
  AND message.status = 'pending_approval'
  AND message.deleted_at IS NULL
  AND action.entity_type = 'outreach_message'
  AND action.entity_id = message.id
  AND action.status IN ('approved', 'rejected')
  AND approval.decision::TEXT = action.status::TEXT;

COMMENT ON FUNCTION public.browser_extension_sync_outreach_status() IS
    'Atomically synchronizes reviewed AI outreach actions to delivery-ready or rejected message states.';
