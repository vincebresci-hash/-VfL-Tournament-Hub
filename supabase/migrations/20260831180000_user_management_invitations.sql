-- =============================================================================
-- PR28: User invitations, admin audit log, avatar storage
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Invitation tracking (Supabase Auth remains source of truth for credentials)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  auth_user_id uuid,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_email_idx
  ON public.user_invitations (lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS user_invitations_status_idx
  ON public.user_invitations (status);

CREATE INDEX IF NOT EXISTS user_invitations_profile_id_idx
  ON public.user_invitations (profile_id);

-- -----------------------------------------------------------------------------
-- Admin audit log (append-only security events)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON public.admin_audit_log (actor_user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_super_admin_all ON public.user_invitations;
CREATE POLICY user_invitations_super_admin_all
  ON public.user_invitations
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS admin_audit_log_super_admin_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_super_admin_read
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS admin_audit_log_super_admin_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_super_admin_insert
  ON public.admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

REVOKE ALL ON TABLE public.user_invitations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_invitations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO authenticated;

-- -----------------------------------------------------------------------------
-- Avatar storage bucket
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
