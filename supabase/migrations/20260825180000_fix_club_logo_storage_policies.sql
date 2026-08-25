-- Additive fix for club-logos storage.
-- Does NOT modify 20260825170000_club_logo_storage.sql.
-- Ensures public-read + admin-only write, and restricts MIME types to PNG/JPEG/WebP.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- Public read (anon + authenticated) so logos render on the website and so
-- Storage INSERT ... RETURNING can return object metadata after admin upload.
DROP POLICY IF EXISTS club_logos_public_read ON storage.objects;
CREATE POLICY club_logos_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'club-logos');

-- Admin-only writes. No anon/public INSERT.
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
