-- =============================================================================
-- VfL Kirchheim Tournament Hub — Partner Management V1 (Phase 1)
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Additive only. Idempotent where practical.
-- DO NOT apply automatically — manual SQL review required before production.
--
-- Phase 1: central partners + logos + public homepage /partner display.
-- Phase 2 (NOT in this migration): tournament_partners relation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------

INSERT INTO public.rbac_permissions (key, name, category) VALUES
  ('partners.view', 'Partner ansehen', 'partners'),
  ('partners.manage', 'Partner verwalten', 'partners')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN ('partners.view', 'partners.manage')
WHERE r.key IN ('SUPER_ADMIN', 'ADMIN', 'COMMUNICATION_MANAGER')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. partners table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NULL,
  website_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partners_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT partners_website_url_http CHECK (
    website_url IS NULL
    OR website_url ~* '^https?://'
  )
);

CREATE INDEX IF NOT EXISTS partners_public_order_idx
  ON public.partners (is_active, sort_order ASC, name ASC, id ASC);

DROP TRIGGER IF EXISTS set_partners_updated_at ON public.partners;
CREATE TRIGGER set_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Public may read ONLY active partners (homepage + /partner).
DROP POLICY IF EXISTS partners_select_public ON public.partners;
CREATE POLICY partners_select_public
  ON public.partners
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admin viewers may read all partners (including inactive).
DROP POLICY IF EXISTS partners_select_admin ON public.partners;
CREATE POLICY partners_select_admin
  ON public.partners
  FOR SELECT
  TO authenticated
  USING (
    public.has_rbac_permission('partners.view')
    OR public.has_rbac_permission('partners.manage')
  );

DROP POLICY IF EXISTS partners_insert_manage ON public.partners;
CREATE POLICY partners_insert_manage
  ON public.partners
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_rbac_permission('partners.manage'));

DROP POLICY IF EXISTS partners_update_manage ON public.partners;
CREATE POLICY partners_update_manage
  ON public.partners
  FOR UPDATE
  TO authenticated
  USING (public.has_rbac_permission('partners.manage'))
  WITH CHECK (public.has_rbac_permission('partners.manage'));

DROP POLICY IF EXISTS partners_delete_manage ON public.partners;
CREATE POLICY partners_delete_manage
  ON public.partners
  FOR DELETE
  TO authenticated
  USING (public.has_rbac_permission('partners.manage'));

REVOKE ALL ON TABLE public.partners FROM PUBLIC;
GRANT SELECT ON TABLE public.partners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.partners TO authenticated;

COMMENT ON TABLE public.partners IS
  'PR-Partner-V1: central partner/sponsor records for Tournament Hub public surfaces. Phase 1 has no tournament relation.';

-- ---------------------------------------------------------------------------
-- 3. Storage bucket: partner-logos
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-logos',
  'partner-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS partner_logos_public_read ON storage.objects;
CREATE POLICY partner_logos_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'partner-logos');

DROP POLICY IF EXISTS partner_logos_admin_insert ON storage.objects;
CREATE POLICY partner_logos_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND public.has_rbac_permission('partners.manage')
  );

DROP POLICY IF EXISTS partner_logos_admin_update ON storage.objects;
CREATE POLICY partner_logos_admin_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND public.has_rbac_permission('partners.manage')
  )
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND public.has_rbac_permission('partners.manage')
  );

DROP POLICY IF EXISTS partner_logos_admin_delete ON storage.objects;
CREATE POLICY partner_logos_admin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND public.has_rbac_permission('partners.manage')
  );
