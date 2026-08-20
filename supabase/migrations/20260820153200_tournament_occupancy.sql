-- =============================================================================
-- VfL Kirchheim Tournament Hub — öffentliche Turnier-Auslastung
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Bestehende Migrationen NICHT erneut ausführen.
-- max_teams existiert bereits in public.tournaments — keine Schema-Änderung daran.
--
-- Gäste dürfen nur aggregierte Platzzahlen lesen, keine Bewerbungsdaten.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tournament_occupancy()
RETURNS TABLE (
  slug text,
  max_teams integer,
  confirmed_teams integer,
  waiting_list_count integer,
  under_review_count integer,
  new_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tournaments.slug,
    tournaments.max_teams,
    COUNT(applications.id) FILTER (
      WHERE applications.status = 'accepted'::public.application_status
    )::integer AS confirmed_teams,
    COUNT(applications.id) FILTER (
      WHERE applications.status = 'waiting-list'::public.application_status
    )::integer AS waiting_list_count,
    COUNT(applications.id) FILTER (
      WHERE applications.status = 'under-review'::public.application_status
    )::integer AS under_review_count,
    COUNT(applications.id) FILTER (
      WHERE applications.status = 'new'::public.application_status
    )::integer AS new_count
  FROM public.tournaments
  LEFT JOIN public.applications
    ON applications.tournament_id = tournaments.id
  GROUP BY tournaments.id, tournaments.slug, tournaments.max_teams;
$$;

REVOKE ALL ON FUNCTION public.tournament_occupancy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_occupancy() TO anon, authenticated;
