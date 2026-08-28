-- =============================================================================
-- VfL Kirchheim Tournament Hub — News Posts
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Additive only. Idempotent where practical.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  excerpt text NOT NULL,
  content text NOT NULL,
  image_url text NULL,
  published_at timestamptz NULL,
  featured boolean NOT NULL DEFAULT false,
  tournament_id uuid NULL REFERENCES public.tournaments (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT news_posts_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT news_posts_slug_not_empty CHECK (length(trim(slug)) > 0),
  CONSTRAINT news_posts_excerpt_not_empty CHECK (
    length(trim(excerpt)) > 0
    AND length(excerpt) <= 300
  ),
  CONSTRAINT news_posts_content_not_empty CHECK (length(trim(content)) > 0),
  CONSTRAINT news_posts_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS news_posts_published_at_idx
  ON public.news_posts (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS news_posts_active_published_idx
  ON public.news_posts (published_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_news_posts_updated_at ON public.news_posts;
CREATE TRIGGER set_news_posts_updated_at
  BEFORE UPDATE ON public.news_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_posts_select_public ON public.news_posts;
CREATE POLICY news_posts_select_public
  ON public.news_posts
  FOR SELECT
  TO anon, authenticated
  USING (
    archived_at IS NULL
    AND published_at IS NOT NULL
    AND published_at <= now()
  );

DROP POLICY IF EXISTS news_posts_admin_all ON public.news_posts;
CREATE POLICY news_posts_admin_all
  ON public.news_posts
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.news_posts FROM PUBLIC;
GRANT SELECT ON TABLE public.news_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.news_posts TO authenticated;
