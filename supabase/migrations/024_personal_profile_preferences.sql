-- ==========================================
-- 024_personal_profile_preferences.sql
-- Personal identity, preferences, and avatar storage
-- ==========================================

ALTER TABLE public.users
    ADD COLUMN job_title TEXT,
    ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC',
    ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-IN',
    ADD COLUMN email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN product_updates BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN ai_assistance_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN avatar_path TEXT;

ALTER TABLE public.users
    ADD CONSTRAINT users_full_name_length CHECK (full_name IS NULL OR char_length(btrim(full_name)) BETWEEN 2 AND 80),
    ADD CONSTRAINT users_job_title_length CHECK (job_title IS NULL OR char_length(btrim(job_title)) <= 80),
    ADD CONSTRAINT users_timezone_length CHECK (char_length(btrim(timezone)) BETWEEN 1 AND 64),
    ADD CONSTRAINT users_locale_allowed CHECK (locale IN ('en-IN', 'en-US', 'en-GB')),
    ADD CONSTRAINT users_avatar_path_owner CHECK (avatar_path IS NULL OR avatar_path ~ '^[0-9a-f-]{36}/[^/]+$');

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'avatars',
    'avatars',
    TRUE,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;

CREATE POLICY "avatars_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);

CREATE POLICY "avatars_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
)
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);

CREATE POLICY "avatars_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
);