# Champions League — Migrations- und Rollback-Runbook

Stand: CL Release 1.1 auf `feature/champions-league-mode`, PR #135.

Dieses Runbook führt nichts automatisch aus. Produktive Migrationen, Merge und
Production-Deployment benötigen eine gesonderte Freigabe. Der tatsächliche
produktive Migrationsstand ist derzeit **ungeklärt**, weil der verbundene
Supabase-Zugang das Produktionsprojekt nicht lesen kann. Deshalb wurden die vier
vorhandenen CL-Migrationsdateien nicht verändert; Release 1.1 ergänzt eine fünfte,
nachgelagerte Remediation-Migration.

## 1. SQL-Dateien, Reihenfolge und Prüfsummen

| # | Datei | SHA-256 | Abhängigkeit / Zweck |
|---:|---|---|---|
| 1 | `20261121121000_champions_league_competition_config.sql` | `e37c898009fd88dfc9192f6afe728c8f3ff9e262c4df09ea79556e7e6ac7fa20` | Vier nullable CL-Spalten und CHECK-Constraints |
| 2 | `20261121124500_save_competition_configuration.sql` | `5f2479df42072c65152c1967e5b738b2c0f9854127d855419f3d9c320bfb59f2` | Abhängig von #1; Save-RPC und fünf Parent-Row-Lock-Trigger |
| 3 | `20261122180000_apply_champions_league_league_phase.sql` | `2f0e319cd8b68a3616d1728421d8d987c7ee076fd1f52ce97ee87eddc7c21f3c` | Abhängig von #1/#2 sowie RBAC-, Teilnehmer-, Gruppen-, Feld- und Match-Schema |
| 4 | `20261125120000_champions_league_round_of_16.sql` | `2753d29d486cac506abd0817022b1c7d1fe64c5bf47a28d6b9838f95598e93da` | Abhängig von Basis-K.-o.-Migration; erweitert den Round-CHECK um `round-of-16` |
| 5 | `20261125190218_champions_league_release_blocker_remediation.sql` | `7fe2f71d891c74b93c1621ad8525f5f9d704272f5743e214b36e9490287566a8` | Abhängig von #1–#3; Schema-/ACL-Härtung und autoritatives Same-Club-Fail-safe |

Die Dateien müssen ausschließlich in Zeitstempelreihenfolge über den bestehenden
Remote-Migrationsworkflow angewendet werden. Keine bereits in
`supabase_migrations.schema_migrations` registrierte Version manuell erneut
ausführen und nicht am Migrationsverlauf vorbei im SQL-Editor anwenden.

## 2. Wirkung der Remediation

- Prüft die vier vorhandenen Spalten auf exakten Typ, Nullable-Status und fehlenden
  Default. Eine abweichende Vorbelegung stoppt die Migration.
- Prüft Constraint-Namen zusammen mit
  `conrelid = 'public.tournaments'::regclass`; gleichnamige Constraints anderer
  Tabellen können die Anlage nicht mehr überspringen.
- Validiert alle vier CL-Constraints. Das kann die Tabelle scannen und benötigt
  ein geprüftes Wartungsfenster.
- Erweitert die Bewerbungs- und External-Team-Lock-Trigger um `club_id`-Änderungen.
  Damit bleibt die Vereinsidentität zwischen RPC-Validierung und Persistierung
  stabil.
- Benennt die bisherige Apply-Funktion in einen nicht direkt aufrufbaren privaten
  Core um und legt unter der öffentlichen Signatur einen neuen Wrapper an.
- Der Wrapper sperrt zuerst die Turnierzeile und bricht bei aktiviertem
  Same-Club-Ausschluss vor jeder Mutation mit `MISSING_CLUB_IDENTITY` ab, sobald
  eine kanonische bestätigte Mannschaft keine Vereins-ID besitzt.
- Bestätigte externe Mannschaften, die mit einer akzeptierten Bewerbung verknüpft
  sind, werden über die Bewerbung dedupliziert. Bei jeder anderen
  Bewerbungsphase bleibt das externe Team kanonisch und benötigt seine eigene
  `tournament_external_teams.club_id`.
- Die Admin-Vorschau und Übernahme bleiben bei fehlenden Identitäten gesperrt.
  Der Hinweis führt direkt zur Teilnehmerverwaltung; angenommene Bewerbungen
  können dort atomar einem Hub-Verein zugeordnet werden. Ein gleichzeitiger
  Statuswechsel verhindert die Zuordnung ohne Teiländerung.
- Der Wrapper validiert Same-Club-Paarungen nochmals selbst und liefert
  `SAME_CLUB_VIOLATION` bei einer unzulässigen Begegnung.
- Entfernt auch möglicherweise erhaltene ACLs aller Nicht-Eigentümer. Nur
  `authenticated` erhält `EXECUTE` auf Save- und öffentlichen Apply-RPC. Core,
  Lock-Helfer und Triggerfunktionen bleiben ohne direkten API-Grant.
- Begrenzt DDL- und RPC-Lock-Wartezeit auf fünf Sekunden. Der Server wiederholt
  ausschließlich explizit abgebrochene RPC-Transaktionen mit SQLSTATE `40P01`
  oder `55P03` genau einmal. Netzwerkfehler und unklare Zustände werden nicht
  wiederholt.

Bei deaktiviertem Same-Club-Ausschluss bleibt der bisherige Teilnehmer- und
Spielplanpfad unverändert.

## 3. Auswirkung der fünf Lock-Trigger

Die Trigger auf `applications`, `tournament_external_teams`,
`tournament_groups`, `tournament_group_members` und `tournament_matches`
serialisieren relevante Änderungen über die Elternzeile in `tournaments`.

Das schützt die atomare Sicht auf Teilnehmer, Gruppen, Begegnungen und Ergebnisse,
kann aber gleichzeitige Bewerbungsannahmen, Teilnehmeränderungen, Live-Ergebnisse
oder Spielplanersetzungen desselben Turniers kurz blockieren. Bewegungen zwischen
zwei Turnieren sperren die beiden UUIDs sortiert. Transaktionen, die mehrere
Turniere in gegensätzlicher Reihenfolge bearbeiten, können weiterhin von
PostgreSQL mit `40P01` abgebrochen werden; der abgebrochene Vorgang darf nur in
einer neuen Transaktion begrenzt wiederholt werden.

Für die Migration gilt deshalb:

1. Wartungsfenster ohne laufende Spiele, Ergebnispflege, Bewerbungsentscheidungen
   oder Teilnehmer-Synchronisation wählen.
2. Nur einen Migrations-Operator verwenden.
3. Vorher aktive Langläufer und Locks read-only prüfen.
4. Bei `55P03`/`40P01` nicht im selben unklaren Clientzustand fortfahren. Status
   der Migrationshistorie neu lesen und erst danach entscheiden.

## 4. Verpflichtende Read-only-Prüfung vor Freigabe

Zuerst Projekt-ID und Remote-Migrationshistorie über den autorisierten
Supabase-Zugang verifizieren. Die folgenden Abfragen liefern nur Metadaten oder
Aggregatwerte und keine Teilnehmerdaten:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT
  a.attname,
  a.atttypid::regtype AS data_type,
  a.attnotnull,
  pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_attribute a
LEFT JOIN pg_attrdef d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.tournaments'::regclass
  AND a.attname IN (
    'competition_format', 'league_matches_per_team',
    'knockout_cutoff', 'restrict_same_club'
  )
  AND NOT a.attisdropped;

SELECT
  c.conrelid::regclass AS relation,
  c.conname,
  c.convalidated,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN (
  'public.tournaments'::regclass,
  'public.tournament_matches'::regclass
)
AND c.conname IN (
  'tournaments_competition_format_check',
  'tournaments_league_matches_per_team_check',
  'tournaments_knockout_cutoff_check',
  'tournaments_competition_format_params_check',
  'tournament_matches_round_check'
)
ORDER BY relation::text, c.conname;

SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef,
  p.proconfig,
  p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'save_competition_configuration',
    'apply_champions_league_league_phase',
    'apply_champions_league_league_phase_validated_core_v1',
    'competition_config_lock_tournaments',
    'competition_config_lock_application',
    'competition_config_lock_external_team',
    'competition_config_lock_group',
    'competition_config_lock_group_member',
    'competition_config_lock_match'
  )
ORDER BY function_signature::text;

SELECT
  tgrelid::regclass AS relation,
  tgname,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname LIKE 'competition_config_lock_%'
ORDER BY relation::text, tgname;

-- Nur Aggregatzahlen: bei Same-Club=true muss das Ergebnis 0 sein.
WITH accepted AS (
  SELECT a.tournament_id, a.id, a.club_id
  FROM public.applications a
  WHERE a.status = 'accepted'
), canonical AS (
  SELECT tournament_id, id, club_id FROM accepted
  UNION ALL
  SELECT e.tournament_id, e.id, e.club_id
  FROM public.tournament_external_teams e
  WHERE e.participation_status = 'confirmed'
    AND e.external_active IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM accepted a
      WHERE a.tournament_id = e.tournament_id
        AND a.id = e.application_id
    )
)
SELECT count(*) AS missing_club_identities
FROM canonical c
JOIN public.tournaments t ON t.id = c.tournament_id
WHERE t.restrict_same_club IS TRUE
  AND c.club_id IS NULL;
```

Zusätzlich RLS-Status, `pg_policies`, Tabellen-/Routine-Grants, aktuelle Locks,
Tarif, letzten Backup-Zeitpunkt, Aufbewahrungsfenster und PITR-Status prüfen.

## 5. Freigegebener Aktivierungsablauf

1. Exakte Produktionsprojekt-ID bestätigen.
2. Vorhandene Versionsnummern aus `schema_migrations` gegen die Tabelle in §1
   abgleichen. Bereits registrierte Dateien nicht erneut ausführen.
3. Wiederherstellbaren Backup-/PITR-Punkt und Zeitpunkt dokumentieren.
4. Anwendungsschreibvorgänge für das Wartungsfenster organisatorisch stoppen.
5. Supabase-CLI-Version pinnen; bei CLI v3 das Remote-Ziel ausdrücklich wählen.
6. Alle noch fehlenden Dateien mit einem Operator in Zeitstempelreihenfolge über
   den bestehenden Migrationsworkflow anwenden.
7. Migrationshistorie, Spalten, Constraints, Trigger, Funktionssignaturen und ACLs
   erneut read-only prüfen.
8. Erst danach den Code-Commit bereitstellen. Ein Merge nach `main` löst im
   bestehenden Vercel-Git-Workflow automatisch ein Production-Deployment aus und
   darf daher nicht vor DB-Verifikation und ausdrücklicher Freigabe erfolgen.
9. Öffentliches GET-Smoke-Testing durchführen; Admin-Schreibpfade ausschließlich
   am ausdrücklich vorgesehenen Testturnier testen.

## 6. Funktionsprüfung mit vorgesehenem Testturnier

- Keine realen Kontakt- oder personenbezogenen Teilnehmerdaten verwenden.
- 18 eindeutig zugeordnete Testmannschaften, Top 16, Same-Club aktiviert,
  mehrere Vereine und mindestens ein Verein mit mehreren Teams.
- Eine manuelle, eine MeinTurnierplan- und eine mit nicht akzeptierter Bewerbung
  verknüpfte externe Mannschaft einbeziehen.
- Vor Zuordnung einer Testmannschaft nachweisen, dass Vorschau und RPC mit
  `MISSING_CLUB_IDENTITY` ohne Gruppen-/Match-/Konfigurationsänderung abbrechen.
- Danach Ligaphase, berechnete Tabelle, Top-16-Qualifikation, Achtel-, Viertel-,
  Halbfinale, Spiel um Platz 3 und Finale prüfen.
- Ein bestehendes klassisches Gruppenturnier vorher/nachher ausschließlich lesen
  und auf unveränderte Darstellung vergleichen.
- Archivierung oder Löschung des Testturniers nur nach eigener Freigabe.

## 7. Rückfallstrategie

Bevorzugt zuerst den Anwendungscode auf den vorherigen Commit zurückrollen. Die
nullable Spalten und zusätzlichen Sicherheitsprüfungen können in der Datenbank
verbleiben; das ist risikoärmer als ein DDL-Rückbau.

Ein vollständiger Datenbankrückbau ist nur zulässig, wenn:

```sql
SELECT count(*)
FROM public.tournaments
WHERE competition_format = 'champions-league';
```

exakt `0` liefert und keine `round-of-16`-Zeilen existieren. Danach – nur mit
gesonderter SQL-Freigabe – in umgekehrter Reihenfolge:

1. Öffentlichen Apply-Wrapper entfernen und privaten Core wieder auf den alten
   Namen zurückbenennen; ACL anschließend explizit neu setzen.
2. Nur bei notwendigem exakten Rückbau die zwei Teilnehmer-Trigger ohne
   `club_id` neu anlegen. Die übrige ACL-Härtung kann bestehen bleiben.
3. `tournament_matches_round_check` nur ohne vorhandene `round-of-16`-Zeilen auf
   die alte Definition zurücksetzen.
4. Save-/Apply-Funktionen und fünf Trigger nur entfernen, wenn kein Deployment sie
   mehr aufruft.
5. Die vier Spalten zuletzt und nur bei nachgewiesener Nichtnutzung entfernen.

PITR ist der Disaster-Recovery-Pfad, nicht der normale Funktionsrollback: Eine
Wiederherstellung erzeugt Ausfallzeit und setzt auch unabhängige produktive
Schreibvorgänge zurück. Vor einem Rückfall Migrationshistorie und Datenzustand
erneut lesen; nie blind dieselbe fehlgeschlagene Migration wiederholen.
