# Champions League — Migrations- & Rollback-Runbook

Stand: Branch `feature/champions-league-mode`, PR #135. Dieses Runbook wird
**nicht automatisch ausgeführt**. Produktive Migrationen, Merge und Deployment
erfolgen ausschließlich nach ausdrücklicher Freigabe.

## 1. Erforderliche produktive Migrationen (in Ausführungsreihenfolge)

Supabase wendet Migrationen in der Reihenfolge der Dateinamen-Zeitstempel an.
Für den Champions-League-Modus sind genau diese vier erforderlich, keine weiteren:

| # | Datei | Inhalt | Abhängigkeit |
|---|-------|--------|--------------|
| 1 | `20261121121000_champions_league_competition_config.sql` | Nullbare Spalten `competition_format`, `league_matches_per_team`, `knockout_cutoff`, `restrict_same_club` + CHECK-Constraints (`knockout_cutoff IN (4,8,16)`) | — |
| 2 | `20261121124500_save_competition_configuration.sql` | `save_competition_configuration` (für CL **inaktiv**: `CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED`) + fünf BEFORE-ROW-Lock-Trigger | #1 (prüft Spalten) |
| 3 | `20261122180000_apply_champions_league_league_phase.sql` | `apply_champions_league_league_phase` (Top 4/8/16, Same-Club-Durchsetzung, schreibt die vier Spalten + Liga-Gruppe + Memberships + Ligaspiele transaktional) | #1 (Spalten), #2 (Lock-Trigger-Disziplin) |
| 4 | `20261125120000_champions_league_round_of_16.sql` | Ersetzt CHECK `tournament_matches_round_check` um `round-of-16` | Basis-KO-Migration `20260820200000` (bereits produktiv) |

**Eigenschaften:** Alle vier sind **additiv** und **nullbar**. Es werden keine
Bestandsdaten verändert, keine Gruppen/Spiele gelöscht, kein Backfill. Turniere
mit `competition_format = NULL` verhalten sich unverändert (Legacy-Ableitung aus
der Gruppenzahl).

## 2. Sicherheits- und Kompatibilitätsbefund (read-only geprüft)

- **Keine bereits angewandte Migration wurde verändert.** Die vier CL-Dateien
  existieren **nicht** auf `main` → sie sind in Produktion nicht angewandt. Die
  produktiv vorhandene Basis-KO-Migration `20260820200000_knockout_stage.sql`
  ist gegenüber `main` **unverändert**; `round-of-16` kommt als **neue** Datei.
- **RLS/Grants:** `apply_champions_league_league_phase` und
  `save_competition_configuration` sind `SECURITY DEFINER`, `REVOKE ALL … FROM
  PUBLIC`, `GRANT EXECUTE … TO authenticated`. Beide verlangen `auth.uid()` und
  die RBAC-Rechte `tournaments.manage` **und** `schedule.manage`. `anon` und
  `service_role` werden abgelehnt (per Contract-Test verifiziert). Die
  Lock-Helfer-Funktionen sind vollständig `REVOKE … FROM PUBLIC`.
- **Transaktion/Nebenläufigkeit:** Fünf BEFORE-ROW-Lock-Trigger (applications,
  external_teams, groups, group_members, matches) sperren stets zuerst die
  Eltern-`tournaments`-Zeile (in UUID-Reihenfolge). Save, Apply, Spielplan-
  ersetzung und manuelle Kind-Schreibvorgänge nehmen damit immer zuerst den
  Eltern-Lock. Optimistisches Locking über `expected_updated_at` → bei paralleler
  Änderung `STALE_CONFIGURATION`. Deadlock/Lock-Timeout-Verhalten per
  Nebenläufigkeitstests abgedeckt.
- **Schutz bestehender Turniere:** Apply lehnt ab bei gespeichertem Bestands-
  format (`LEGACY_FORMAT`), vorhandenen Gruppen/Spielen ohne CL-Format
  (`UNSAFE_LEGACY_CONVERSION`), gespielten/Live-/K.-o.-Spielen (`RESULTS_EXIST`,
  `LIVE_MATCH`, `KNOCKOUT_MATCHES`) und abgeschlossenen Turnieren
  (`LIFECYCLE_COMPLETED`). Gespielte, laufende und K.-o.-Spiele werden nie
  gelöscht.
- **Inaktiver Save:** `save_competition_configuration` gibt für einen
  CL-Spaltenschreibvorgang weiterhin `CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED`
  zurück; der vollständige CL-Schreibpfad läuft ausschließlich über
  `apply_champions_league_league_phase`.
- **Same-Club:** Der Apply-RPC leitet die Vereinsidentität autoritativ aus
  `applications.club_id` bzw. `tournament_external_teams.club_id` ab und lehnt
  jede eingereichte Paarung mit gleicher Vereins-ID ab (`SAME_CLUB_VIOLATION`).
  Teams ohne `club_id` können die Regel nicht abdecken — der Adminbereich warnt
  vor nicht hinterlegten Vereinszuordnungen (kein stilles Umgehen).

## 3. Read-only-Verifikation gegen die Produktionsdatenbank (vor der Freigabe)

Diese Abfragen **lesen nur** und dürfen vor dem Apply gegen Produktion laufen,
um den Ausgangszustand zu bestätigen (erwartet: alles „nicht vorhanden"):

```sql
-- Spalten noch nicht vorhanden (erwartet: 0 Zeilen)
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='tournaments'
  AND column_name IN ('competition_format','league_matches_per_team','knockout_cutoff','restrict_same_club');

-- RPCs noch nicht vorhanden (erwartet: beide NULL)
SELECT to_regprocedure('public.apply_champions_league_league_phase(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)') AS apply_fn,
       to_regprocedure('public.save_competition_configuration(uuid,timestamptz,text,integer,integer)') AS save_fn;

-- Round-Check noch ohne round-of-16 (erwartet: round-of-16 NICHT enthalten)
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='tournament_matches_round_check';
```

## 4. Aktivierungsablauf (nach Freigabe)

1. **Backup:** Vollständiges Supabase-Backup/PITR-Punkt setzen und Zeitstempel notieren.
2. **Snapshot:** DDL des aktuellen Zustands sichern (Abfragen aus §3 ausführen und Ergebnisse speichern).
3. **Apply:** Die vier Migrationen in Reihenfolge anwenden (Supabase-Migrations-Pipeline des bestehenden Workflows). **Nicht** einzeln aus der Hand gegen Produktion ausführen.
4. **Post-Verifikation (read-only):**
   - Spalten & CHECKs vorhanden: `knockout_cutoff IN (4,8,16)`, Spalte `restrict_same_club` vorhanden.
   - `tournament_matches_round_check` enthält `round-of-16`.
   - Beide RPCs vorhanden, `authenticated` darf `EXECUTE`, `anon`/`public` nicht.
   - Stichprobe: ein bestehendes Bestandsturnier öffnet sich unverändert (öffentliche Seite + Admin), `competition_format` ist dort `NULL`.
5. **Smoke-Test (ohne Produktionsdatenänderung an Bestandsturnieren):** Optional ein neues Testturnier anlegen, CL-Modus + Felder + Zeiten setzen, Spielplan generieren und übernehmen, Ergebnisse/Tabelle/K.-o. prüfen, danach das Testturnier wieder löschen.

## 5. Rückfallstrategie (Rollback)

Reihenfolge umgekehrt zur Anwendung. Da alles additiv/nullbar ist, ist der
Rollback unkritisch, solange noch **kein** Turnier `competition-league` nutzt.

```sql
-- 1. Round-of-16 zurücknehmen (Basis-Constraint wiederherstellen)
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_round_check;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_round_check
  CHECK (round IS NULL OR round IN ('quarterfinal','semifinal','third-place','final','placement-5','placement-7'));

-- 2. Apply-RPC entfernen
DROP FUNCTION IF EXISTS public.apply_champions_league_league_phase(uuid,timestamptz,integer,integer,boolean,boolean,jsonb);

-- 3. Save-RPC + Lock-Trigger entfernen (nur wenn gewünscht; Trigger sind für Bestandsformate harmlos)
--    (Trigger: competition_config_lock_application/_external_team/_group/_group_member/_match)
--    DROP TRIGGER … ON … ; DROP FUNCTION public.save_competition_configuration(…), public.competition_config_* ;

-- 4. Spalten entfernen (NUR wenn kein Turnier sie nutzt)
ALTER TABLE public.tournaments
  DROP COLUMN IF EXISTS restrict_same_club,
  DROP COLUMN IF EXISTS knockout_cutoff,
  DROP COLUMN IF EXISTS league_matches_per_team,
  DROP COLUMN IF EXISTS competition_format;
```

**Wichtig:** Sobald ein Turnier aktiv `champions-league` nutzt, Rollback nur mit
PITR auf den Backup-Punkt aus §4.1 (sonst Datenverlust für dieses Turnier). Vor
jedem Spalten-Drop prüfen:
`SELECT count(*) FROM public.tournaments WHERE competition_format='champions-league';`
(muss 0 sein).

## 6. Rückfall auf Codeebene

Der CL-Code degradiert fail-closed: fehlen die Spalten/RPCs, liefert
`readStoredLeagueScheduleConfig` den Status `missing_column`, die öffentliche
Seite zeigt den Legacy-Modus, und der Admin meldet, dass die SQL-Migration noch
aussteht. Ein Revert des Feature-Branches ist jederzeit ohne DB-Abhängigkeit
möglich.
