-- =============================================================================
-- Öffentliches Lesen von app_settings
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Ohne diese Policy fallen getAppSettings() für Gäste und Vereine
-- still auf Default-Werte zurück. Der globale Schalter
-- "Bewerbungen deaktivieren" greift dann nicht.
-- Schreiben bleibt ausschließlich Admin/Super-Admin.
-- Diese Datei NICHT selbst gegen Produktion aus dem Agenten ausführen.
-- =============================================================================

GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;

DROP POLICY IF EXISTS app_settings_select_public ON public.app_settings;
CREATE POLICY app_settings_select_public
  ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
