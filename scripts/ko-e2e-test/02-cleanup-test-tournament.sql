-- =============================================================================
-- VfL Kirchheim — E2E KO-Test: Cleanup
-- =============================================================================
--
-- NICHT vom Agenten ausführen.
-- Nur nach abgeschlossenem Test im Supabase SQL Editor manuell ausführen.
--
-- Löscht AUSSCHLIESSLICH Daten mit diesen Markern:
--   tournaments.slug = 'test-ko-tournament'
--   applications.notes = 'E2E-KO-TESTMARKER'
--
-- Reihenfolge wegen ON DELETE RESTRICT auf tournament_matches → applications.
-- =============================================================================

BEGIN;

-- 0) Sicht prüfen
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.tournaments
  WHERE slug = 'test-ko-tournament';

  IF v_count = 0 THEN
    RAISE NOTICE 'Kein Testturnier gefunden (slug test-ko-tournament). Nichts zu löschen.';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'Unerwartet mehrere Turniere mit slug test-ko-tournament.';
  END IF;
END
$$;

-- 1) Spiele zuerst (RESTRICT auf applications)
DELETE FROM public.tournament_matches
WHERE tournament_id IN (
  SELECT id FROM public.tournaments WHERE slug = 'test-ko-tournament'
);

-- 2) E-Mail-Logs der Testbewerbungen (optional, SET NULL würde auch reichen)
DELETE FROM public.email_logs
WHERE application_id IN (
  SELECT id
  FROM public.applications
  WHERE notes = 'E2E-KO-TESTMARKER'
     OR contact_email LIKE 'test-ko-%@example.invalid'
);

-- 3) Bewerbungen (group_members cascaden)
DELETE FROM public.applications
WHERE tournament_id IN (
  SELECT id FROM public.tournaments WHERE slug = 'test-ko-tournament'
)
AND (
  notes = 'E2E-KO-TESTMARKER'
  OR contact_email LIKE 'test-ko-%@example.invalid'
  OR club_name LIKE 'TEST – KO Club %'
);

-- Sicherheit: keine fremden Bewerbungen am Testturnier übrig lassen
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT COUNT(*) INTO v_left
  FROM public.applications
  WHERE tournament_id IN (
    SELECT id FROM public.tournaments WHERE slug = 'test-ko-tournament'
  );

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'Cleanup abgebrochen: % Bewerbung(en) am Testturnier ohne Testmarker. Manuell prüfen.',
      v_left;
  END IF;
END
$$;

-- 4) Turnier (groups/fields/members cascaden)
DELETE FROM public.tournaments
WHERE slug = 'test-ko-tournament';

COMMIT;

-- Kontrolle
SELECT 'tournaments' AS table_name, COUNT(*) AS remaining
FROM public.tournaments
WHERE slug = 'test-ko-tournament'
UNION ALL
SELECT 'applications', COUNT(*)
FROM public.applications
WHERE notes = 'E2E-KO-TESTMARKER'
   OR contact_email LIKE 'test-ko-%@example.invalid'
UNION ALL
SELECT 'matches', COUNT(*)
FROM public.tournament_matches tm
JOIN public.tournaments t ON t.id = tm.tournament_id
WHERE t.slug = 'test-ko-tournament';
