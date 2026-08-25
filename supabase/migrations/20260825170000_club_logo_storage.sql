-- Shared club/team logo storage for the Tournament Hub.
-- First (and only) logo upload infrastructure — reusable for clubs and external teams.
-- Additive only; does not modify 20260825160000_participant_logos.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS club_logos_public_read ON storage.objects;
CREATE POLICY club_logos_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'club-logos');

DROP POLICY IF EXISTS club_logos_admin_insert ON storage.objects;
CREATE POLICY club_logos_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'club-logos' AND public.is_admin());

DROP POLICY IF EXISTS club_logos_admin_update ON storage.objects;
CREATE POLICY club_logos_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'club-logos' AND public.is_admin())
  WITH CHECK (bucket_id = 'club-logos' AND public.is_admin());

DROP POLICY IF EXISTS club_logos_admin_delete ON storage.objects;
CREATE POLICY club_logos_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'club-logos' AND public.is_admin());
