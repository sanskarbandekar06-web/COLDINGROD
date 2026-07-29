-- ==========================================
-- 011_activity_center_notifications.sql
-- Per-member notification delivery and read state for workspace activity.
-- ==========================================

ALTER TABLE public.activities
    ADD CONSTRAINT activities_id_workspace_id_key UNIQUE (id, workspace_id);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    workspace_member_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_member_workspace_fkey
        FOREIGN KEY (workspace_member_id, workspace_id)
        REFERENCES public.workspace_members(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT notifications_activity_workspace_fkey
        FOREIGN KEY (activity_id, workspace_id)
        REFERENCES public.activities(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT notifications_activity_member_key
        UNIQUE (activity_id, workspace_member_id),
    CONSTRAINT notifications_read_state_check
        CHECK (
            (is_read = TRUE AND read_at IS NOT NULL)
            OR (is_read = FALSE AND read_at IS NULL)
        )
);

CREATE INDEX idx_notifications_member_created
    ON public.notifications(workspace_member_id, created_at DESC);
CREATE INDEX idx_notifications_member_unread
    ON public.notifications(workspace_member_id, created_at DESC)
    WHERE is_read = FALSE;
CREATE INDEX idx_notifications_workspace_created
    ON public.notifications(workspace_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = notifications.workspace_member_id
          AND wm.workspace_id = notifications.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
    )
);

CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = notifications.workspace_member_id
          AND wm.workspace_id = notifications.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = notifications.workspace_member_id
          AND wm.workspace_id = notifications.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
    )
);

GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;

-- Active members may record only their own human activity. System and AI
-- activity is written by trusted SECURITY DEFINER functions or server roles.
DROP POLICY IF EXISTS "activities_insert" ON public.activities;
CREATE POLICY "activities_insert" ON public.activities
FOR INSERT
WITH CHECK (
    activities.actor_type = 'human'
    AND activities.actor_user_id = auth.uid()
    AND activities.actor_agent_id IS NULL
    AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activities.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.deleted_at IS NULL
          AND (
              activities.workspace_member_id IS NULL
              OR activities.workspace_member_id = wm.id
          )
    )
);

CREATE OR REPLACE FUNCTION public.deliver_activity_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.notifications (
        workspace_id,
        workspace_member_id,
        activity_id
    )
    SELECT
        NEW.workspace_id,
        wm.id,
        NEW.id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.deleted_at IS NULL
    ON CONFLICT (activity_id, workspace_member_id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deliver_activity_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deliver_activity_notifications() FROM anon;
REVOKE ALL ON FUNCTION public.deliver_activity_notifications() FROM authenticated;

CREATE TRIGGER deliver_activity_notifications_after_insert
AFTER INSERT ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.deliver_activity_notifications();

-- Preserve existing activity in the new Activity Center without presenting
-- historical rows as brand-new unread notifications.
INSERT INTO public.notifications (
    workspace_id,
    workspace_member_id,
    activity_id,
    is_read,
    read_at,
    created_at
)
SELECT
    activity.workspace_id,
    member.id,
    activity.id,
    TRUE,
    NOW(),
    activity.created_at
FROM public.activities activity
JOIN public.workspace_members member
  ON member.workspace_id = activity.workspace_id
 AND member.deleted_at IS NULL
ON CONFLICT (activity_id, workspace_member_id) DO NOTHING;

-- Supabase Realtime is optional locally but available on the hosted project.
-- Adding the table lets the bell refresh as notifications are delivered.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
    END IF;
END;
$$;
