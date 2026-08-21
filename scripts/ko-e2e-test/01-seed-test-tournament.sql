-- =============================================================================
-- VfL Kirchheim — E2E KO-Test: Seed
-- =============================================================================
--
-- NICHT vom Agenten ausführen.
-- Nur im Supabase SQL Editor manuell ausführen, wenn der KO-E2E-Test startet.
--
-- Erzeugt ausschließlich:
--   Turnier: "TEST – KO Tournament" (slug: test-ko-tournament)
--   8 Gast-Bewerbungen status=accepted (keine Clubs, keine Auth-User)
--   2 Gruppen à 4 Teams (A/B)
--   1 Spielfeld
--
-- Erzeugt KEINEN Spielplan und KEINE KO-Spiele.
-- Das erfolgt bewusst in der Admin-UI, damit Gruppenphase + KO live getestet werden.
--
-- Marker für Cleanup:
--   tournaments.slug = 'test-ko-tournament'
--   applications.notes = 'E2E-KO-TESTMARKER'
--   contact_email LIKE 'test-ko-%@example.invalid'
-- =============================================================================

DO $$
DECLARE
  v_tournament_id uuid;
  v_group_a uuid;
  v_group_b uuid;
  v_field_id uuid;
  v_app record;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_labels text[] := ARRAY['A1','A2','A3','A4','B1','B2','B3','B4'];
  v_label text;
  v_i int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tournaments WHERE slug = 'test-ko-tournament'
  ) THEN
    RAISE EXCEPTION 'Slug test-ko-tournament existiert bereits. Zuerst Cleanup ausführen.';
  END IF;

  INSERT INTO public.tournaments (
    name,
    slug,
    age_group,
    birth_year,
    date,
    start_time,
    location,
    address,
    short_description,
    description,
    max_teams,
    status,
    applications_open,
    waitlist_enabled,
    application_start,
    application_deadline,
    match_duration_minutes,
    break_minutes,
    minimum_rest_minutes
  )
  VALUES (
    'TEST – KO Tournament',
    'test-ko-tournament',
    'U10',
    2016,
    CURRENT_DATE + 14,
    '09:00:00',
    'TEST – KO Location',
    'TEST – KO Address 1',
    'Kontrollierter E2E-Test der KO-Runde. Keine echten Vereinsdaten.',
    'Nur für den internen KO-End-to-End-Test. Vollständig löschbar über das Cleanup-Script.',
    8,
    'active'::public.tournament_status,
    false,
    false,
    NULL,
    NULL,
    12,
    3,
    15
  )
  RETURNING id INTO v_tournament_id;

  INSERT INTO public.tournament_fields (tournament_id, name, sort_order)
  VALUES (v_tournament_id, 'TEST – Feld 1', 0)
  RETURNING id INTO v_field_id;

  INSERT INTO public.tournament_groups (tournament_id, name, sort_order)
  VALUES (v_tournament_id, 'Gruppe A', 0)
  RETURNING id INTO v_group_a;

  INSERT INTO public.tournament_groups (tournament_id, name, sort_order)
  VALUES (v_tournament_id, 'Gruppe B', 1)
  RETURNING id INTO v_group_b;

  FOREACH v_label IN ARRAY v_labels
  LOOP
    INSERT INTO public.applications (
      tournament_id,
      club_id,
      team_id,
      submitted_by,
      status,
      club_name,
      club_city,
      team_name,
      age_group,
      birth_year,
      league,
      division,
      self_rated_strength,
      team_description,
      contact_first_name,
      contact_last_name,
      contact_role,
      contact_email,
      contact_phone,
      staff_count,
      notes
    )
    VALUES (
      v_tournament_id,
      NULL,
      NULL,
      NULL,
      'accepted'::public.application_status,
      'TEST – KO Club ' || v_label,
      'TEST City',
      'TEST – KO Team ' || v_label,
      'U10',
      2016,
      'TEST League',
      NULL,
      3,
      'E2E Testdaten – keine echte Mannschaft.',
      'Test',
      'User ' || v_label,
      'Tester',
      'test-ko-' || lower(v_label) || '@example.invalid',
      NULL,
      2,
      'E2E-KO-TESTMARKER'
    )
    RETURNING id INTO v_app;

    v_ids := array_append(v_ids, v_app.id);
  END LOOP;

  -- Gruppe A: A1..A4 = indices 1..4
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.tournament_group_members (group_id, application_id)
    VALUES (v_group_a, v_ids[v_i]);
  END LOOP;

  -- Gruppe B: B1..B4 = indices 5..8
  FOR v_i IN 5..8 LOOP
    INSERT INTO public.tournament_group_members (group_id, application_id)
    VALUES (v_group_b, v_ids[v_i]);
  END LOOP;

  RAISE NOTICE 'Seed OK. tournament_id=% field_id=% group_a=% group_b=%',
    v_tournament_id, v_field_id, v_group_a, v_group_b;
  RAISE NOTICE 'Apps A1..A4=% % % %', v_ids[1], v_ids[2], v_ids[3], v_ids[4];
  RAISE NOTICE 'Apps B1..B4=% % % %', v_ids[5], v_ids[6], v_ids[7], v_ids[8];
END
$$;

-- Kontrolle (nur lesen):
SELECT id, name, slug, status, applications_open, max_teams
FROM public.tournaments
WHERE slug = 'test-ko-tournament';

SELECT club_name, team_name, status, contact_email, notes
FROM public.applications
WHERE notes = 'E2E-KO-TESTMARKER'
ORDER BY club_name;
