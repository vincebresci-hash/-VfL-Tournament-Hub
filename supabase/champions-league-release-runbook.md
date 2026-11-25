# Champions League — Migrations- und Rollback-Runbook

Stand: CL Release 1.4 auf `feature/champions-league-mode`, Commit
`ad7f800a04074908fcf10a1d25aa7dae1a7322b1` plus die hier dokumentierte
Übernahme, PR #135.

Dieses Runbook führt nichts automatisch aus. Produktive Migrationen, Merge und
Production-Deployment benötigen eine gesonderte Freigabe. Das Produktionsprojekt
`ogopebvpojuvheimzged` wurde read-only verifiziert. Alle fünf CL-Migrationen sind
technisch kompatibel und noch nicht angewendet. Die produktive
`supabase_migrations.schema_migrations` fehlt weiterhin vollständig.

Der Einzelabgleich der 66 historischen Dateien ist in
`champions-league-baseline-audit.md` dokumentiert. Kein erwartetes Objekt fehlt,
es besteht jedoch nicht versionierte Produktionsdrift. Diese Drift ist jetzt in
zwei versionierten Baseline-Dateien abgebildet (siehe §1.1), sodass die zu
registrierende Baseline **68** Versionen umfasst (66 historisch + 2
Reconciliation) und ausschließlich die fünf CL-Dateien offenbleiben.

**Lokaler Verifikationsstand dieser Übernahme (reproduzierbar, isolierte
Wegwerf-PostgreSQL-17-Cluster, keine produktiven Schreibvorgänge):**

- `npm run test:competition-postgres`: 55/55 PASS (73 Migrationen inkl. beider
  Reconciliation-Dateien angewendet). Die drei zuvor von Codex gemeldeten
  Regressionen sind behoben — alte synthetische Gastbewerbungs-Fixtures ohne
  `contact_email` wurden an die bereits produktiv geltende Constraint angepasst;
  die Constraint selbst wurde nicht abgeschwächt und die Negativtests bleiben
  erhalten.
- `npm run test:cl-baseline`: 5/5 PASS — initiale Reconciliation nach exakt 66
  historischen Migrationen, idempotenter Reapply erhält Nutzer, Turniere,
  Bewerbungen, Ergebnisse und angepasste E-Mail-Vorlagen, neun versionierte
  Funktionskörper entsprechen den geprüften Fingerprints, gefährliche
  anon/authenticated-Tabellenrechte entfernt.
- `test:cl-advanced` 11/11, `test:cl-public` 9/9, `test:cl-scenarios` 7/7,
  Typecheck sauber, Lint 0 Fehler (1 vorbestehende Warnung, nicht CL),
  Production-Build erfolgreich.

Zum Backup gilt die ausdrückliche Nutzerentscheidung: Ein vollständiges
Produktionsbackup ist **nicht** erforderlich, das Restrisiko eines nicht
wiederherstellbaren Datenverlusts wird bewusst akzeptiert, und Backup ist **kein
Release-Blocker mehr** (§1.2). Es gilt daher **GO für Code, Tests, PR-Vorschau
und die vorbereitete Baseline**, aber weiterhin **NO-GO für produktive
Ausführung, Merge und Production-Deployment bis zur ausdrücklichen
Produktionswrite-Freigabe des Nutzers**.

## 0. Durchführungsprotokoll — CL Release 2 (produktive DB-Aktivierung)

**Status: ABGESCHLOSSEN am 2026-11-25 (UTC) auf `ogopebvpojuvheimzged`.** Ausgeführt
nach ausdrücklicher Produktionswrite-Freigabe des Nutzers inkl. bewusster
Risikoakzeptanz ohne vollständiges Backup. Kein Merge, kein Production-Deployment.

Ablauf (kontrolliert, transaktional, mit Vorher-/Nachher-Prüfungen):

1. Read-only Preflight: HEAD `41dc418`, CI grün, Projekt `ogopebvpojuvheimzged`
   (PG 17.6), Historie leer. Alle Reconciliation-Endzustände vorhanden **außer**
   der ACL-Härtung: 216 Schema-Maintenance-Rechte (TRUNCATE/REFERENCES/TRIGGER/
   MAINTAIN) für `anon`/`authenticated` auf 38 Tabellen noch vorhanden.
2. Dry-Run (BEGIN … ROLLBACK) der Härtungsmigration auf Produktion: exakt 216
   Tabellen-Grants + 1 Default-ACL-Eintrag entfernt; **keine** DML-Rechte, **keine**
   Funktions-ACL, **keine** Struktur-/Datenänderung. Nichts persistiert.
3. 66 historische Versionen als `applied` registriert (keine DDL-Ausführung).
4. Reconciliation-Dateien `20261120120000` (Härtung) und `20261120121000`
   (Recovery-Vorlage) transaktional ausgeführt und als `applied` registriert.
   Checkpoint: gefährliche Grants **216 → 0**, DML unverändert (45/25/24/19),
   Zeilenzahlen unverändert.
5. Fünf CL-Migrationen via `supabase migration up` angewendet und registriert.
6. Endverifikation: Historie **73/0**, CL-Spalten 4, save-/apply-RPC vorhanden,
   5 Lock-Trigger, `round-of-16` und `champions-league`-Format aktiv,
   gefährliche Grants 0, DML erhalten, Turniere 20 / Bewerbungen 272 / Matches
   328 / Profile 9 / Vorlagen 12 unverändert.

Offen (bewusst, bis zur Freigabe): Code-Merge nach `main` und das dadurch
ausgelöste Vercel-Production-Deployment. Die additive CL-Schemaebene beeinflusst
die laufende Produktionsanwendung nicht (nullable Spalten, neue RPCs, nur
Nicht-DML-Rechte entfernt).

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

### 1.1 Historische Baseline vor den CL-Dateien

- Historischer Satz: exakt die 66 Versionen von `20260819170000` bis
  `20261009150000`.
- Ergebnis: 53 vollständig vorhanden, 12 teilweise vorhanden, keine fehlend,
  eine wegen eines Replay-Defekts nicht eindeutig nachweisbar.
- Produktion enthält darüber hinaus nicht versionierte Recovery-/ACL-Drift.
  Diese Drift ist jetzt in den zwei Reconciliation-Dateien
  `20261120120000_production_baseline_reconciliation.sql` und
  `20261120121000_production_participation_recovery_template.sql` versioniert.
  Sie sortieren nach den 66 historischen Dateien und vor den fünf CL-Dateien.
- Die zu registrierende Baseline umfasst damit **68** Versionen (66 historisch +
  2 Reconciliation). Auf frischen lokalen Datenbanken werden alle 68 Dateien
  tatsächlich ausgeführt und per `npm run test:cl-baseline` als idempotent und
  datenerhaltend verifiziert.
- Keine der 66 historischen SQL-Dateien darf erneut produktiv ausgeführt werden.
  Das würde unter anderem alte Seed-Turniere wieder anlegen und neuere
  Funktionskörper überschreiben.
- Die beiden Reconciliation-Dateien dürfen auf Produktion **nur als bereits
  angewendet registriert** werden, nachdem ihre Voraussetzungen und
  beabsichtigten Endzustände (vier Funktionskörper-Abweichungen, fünf
  Participation-Recovery-Funktionen, Spalte `pending_activation`, zwei
  Constraints, Index, zwei Enum-Werte, gehärtete Default-ACLs, vorhandene
  Recovery-Vorlage) read-only nachgewiesen sind. Sie dürfen produktiv **nicht**
  ausgeführt werden, da die betroffenen Zustände dort bereits ganz oder teilweise
  existieren.
- Bewusst nicht in die Baseline übernommen werden die Helfer `rls_auto_enable`
  und `upsert_status_email_template` sowie die unnötigen öffentlichen
  Standardberechtigungen; diese Abweichungen sind akzeptiert und dokumentiert.
- Ein später freigegebenes `migration repair --status applied` markiert nur die
  Historie; es führt kein SQL aus. Es darf erst nach erneuter Read-only-Nachweis-
  prüfung und ausdrücklicher Produktionswrite-Freigabe erfolgen. Ein vollständiges
  Backup ist dafür laut Nutzerentscheidung keine Voraussetzung (§1.2).
- Nach erfolgreicher Baseline muss `migration list --remote` exakt 68
  übereinstimmende Local/Remote-Versionen und ausschließlich die fünf Dateien aus
  §1 als offen zeigen.

### 1.2 Backup- und Restore-Bereitschaft (Risiko bewusst akzeptiert)

**Nutzerentscheidung:** Ein vollständiges Produktionsbackup ist nicht
erforderlich. Das Restrisiko eines nicht wiederherstellbaren Datenverlusts wird
bewusst akzeptiert. Backup ist **kein Release-Blocker** und keine Voraussetzung
für die Baseline-Registrierung oder die CL-Migrationen mehr. Der folgende
Abschnitt bleibt als optionale Referenz erhalten, falls später doch ein
Sicherungssatz gewünscht wird; er ist ausdrücklich nicht mehr verpflichtend.

Aktueller Management-API-Status:

- Region `eu-central-1`
- WAL-G aktiviert
- PITR deaktiviert
- keine aufgelisteten Backups
- keine `physical_backup_data`

Der Organisationstarif wird vom bestehenden CLI-Profil nicht angezeigt. Ein
leeres Backup-Listing ist kein Wiederherstellungspunkt; dies ist Teil des bewusst
akzeptierten Risikos.

Ein vollständiger logischer Sicherungssatz muss außerhalb des Repositorys
verschlüsselt abgelegt werden und mindestens enthalten:

1. Custom-Rollen/Attribute (`--role-only`; Passwörter sind nicht enthalten),
2. Anwendungsschema einschließlich Funktionen, ACLs, RLS, Trigger, Sequenzen und
   Constraints,
3. Datenexport einschließlich `public`, Auth-Daten und Storage-Metadaten,
4. separat heruntergeladene Storage-Dateien,
5. Manifest mit Projekt-ID, UTC-Zeit, Tool-Versionen, Dateigrößen,
   SHA-256-Prüfsummen und anonymisierten Aggregatkontrollen.

Der Default-Schema-Dump der Supabase CLI schließt verwaltete Schemas wie `auth`
und `storage` aus. Eigene Trigger/Policies dort müssen aus den versionierten
Migrationen bzw. einem separaten Drift-Capture stammen. Storage-Binärdateien sind
nie Bestandteil des Datenbank-Backups.

Aktueller Umfang ohne personenbezogene Details: Datenbank ca. 19,8 MB,
`public` ca. 4,8 MB, `auth` ca. 1,9 MB, `storage`-Metadaten ca. 1,0 MB;
192 Storage-Objekte mit zusammen ca. 6,7 MB laut Metadaten.

Der lokale synthetische Dump/Restore-Test war vollständig erfolgreich
(1.420/1.420 Metadatenobjekte, keine Abweichung). Ein produktiver Export und ein
Restore von Auth/Storage wurden nicht durchgeführt; nach Nutzerentscheidung sind
sie **kein** Release-Blocker mehr, sondern optional.

Wichtig: `supabase db dump --dry-run` mit dem CLI-v3-Profil initialisiert einen
temporären Login und gibt dessen temporäres Kennwort im Terminal aus. Dieser Weg
darf nicht in CI, Chat oder protokollierten Sitzungen benutzt werden. Für den
echten Export ist entweder die bestehende Datenbankverbindung sicher außerhalb
von Logs zu übergeben oder eine gesondert freigegebene Exportberechtigung zu
verwenden. Kein Passwort-Reset ist Teil dieses Runbooks.

### 1.3 Konkretes logisches Backup-Verfahren

Voraussetzungen: vorhandene direkte oder Session-Pooler-Verbindung sicher im
Prozesskontext, PostgreSQL-17.11-Clients, genügend lokaler Speicher, ein Ziel
außerhalb des Git-Repositories und ein getrennt verwahrtes Backup-Passwort. Die
Verbindungszeichenfolge und das Passwort dürfen weder in Skripten noch in der
Shell-History, Logs oder Manifesten stehen.

1. Außerhalb des Repositorys einen datierten Arbeitsordner anlegen und ACLs auf
   den ausführenden Windows-Benutzer beschränken.
2. Mit `pg_dumpall --roles-only` die Rollen ohne Passwortwerte exportieren.
3. Mit `pg_dump --schema-only` das Anwendungsschema exportieren. Supabase-
   verwaltete Basisschemata werden im Restore von der Zielinstanz bereitgestellt;
   eigene `auth`-/`storage`-Trigger und Policies kommen aus Migrationen bzw.
   Drift-Capture.
4. Mit `pg_dump --data-only --format=custom` die Daten einschließlich Auth- und
   Storage-Metadaten exportieren; `storage.buckets_vectors` und
   `storage.vector_indexes` gemäß Supabase-Dokumentation ausschließen.
5. Storage-Binärdateien aller Buckets mit einem read-only Storage-Zugang separat
   herunterladen. Die 192 erwarteten Objekte und die aggregierten Byte-Summen
   gegen §1.2 prüfen, ohne Objektnamen zu protokollieren.
6. Rollen-, Schema-, Daten- und Storage-Artefakte zusammen mit einem
   nicht-sensitiven Manifest archivieren. Mit dem vorhandenen OpenSSL außerhalb
   des Repositorys interaktiv verschlüsseln, sodass das Passwort nicht als
   Befehlsargument erscheint, zum Beispiel AES-256-CBC mit PBKDF2 und hoher
   Iterationszahl. Für einen dauerhaften Prozess ist ein authentifiziertes
   Format wie `age` oder 7-Zip AES-256 vorzuziehen; diese Werkzeuge sind auf dem
   geprüften Rechner derzeit nicht installiert.
7. SHA-256 des verschlüsselten Artefakts berechnen, Entschlüsselung testweise in
   einen zweiten restriktiven Temp-Ordner durchführen und erst danach Klartext-
   Zwischenstände entfernen.
8. In einer isolierten lokalen Supabase-Instanz zuerst Rollen, dann Schema, dann
   Daten restaurieren. Vor Schema-Restore die dokumentierten Default-Privileges
   für Tabellen, Funktionen und Sequenzen von `anon`/`authenticated` widerrufen,
   damit die produktiven ACLs nicht unbemerkt erweitert werden.
9. Auth-Anmeldung mit synthetischem Testkonto, RLS/ACLs, Funktionen, Sequenzen,
   Storage-Metadaten und Binärdatei-Checks prüfen. Keine produktiven E-Mails oder
   externen Integrationen auslösen.
10. Erst wenn der Restore-Test bestanden ist, Backup-Zeitpunkt, RPO, Prüfsumme,
    Restore-Dauer und Ergebnis im Freigabeprotokoll dokumentieren.

Zusätzliche Rechte sind erforderlich, falls die vorhandene Verbindung keine
Rollen, `auth`-/`storage`-Daten oder alle Storage-Dateien lesen darf. Eine neue
Login-Rolle, S3-Schlüssel, ein Service-Role-Key oder ein CLI-generierter
temporärer Login sind produktive Zugriffsänderungen bzw. Secrets und benötigen
eine eigene Freigabe. Der aktuelle Read-only-Auftrag deckt sie nicht ab.

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

Der produktive Read-only-Preflight (CL Release 1.3/1.4) hat bestätigt:

- exakte Projekt-ID `ogopebvpojuvheimzged`, Datenbankrolle
  `supabase_read_only_user`, `transaction_read_only=on`, PostgreSQL 17;
- keine `supabase_migrations.schema_migrations`;
- keine produktiven CL-Spalten, -Constraints, -Funktionen oder -Trigger;
- alle Voraussetzungen der fünf CL-Dateien vorhanden;
- vollständiger 66-Dateien-Audit gemäß
  `champions-league-baseline-audit.md`;
- 123 bestehende Advisor-Warnungen gemäß
  `champions-league-advisor-warnings.md`;
- kein gelisteter Backup-/PITR-Wiederherstellungspunkt.

Vor jeder späteren Freigabe sind Projekt-ID, Remote-Migrationshistorie und
Backup-Zeitpunkt erneut zu verifizieren. Die folgenden Abfragen liefern nur
Metadaten oder Aggregatwerte und keine Teilnehmerdaten:

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
Tarif, letzten Backup-Zeitpunkt, Aufbewahrungsfenster und PITR-Status prüfen. Für
den historischen Soll/Ist-Abgleich ist ausschließlich das read-only Skript
`scripts/cl_release_baseline_catalog.sql` vorgesehen.

## 5. Geplanter Aktivierungsablauf — noch nicht freigegeben

1. Exakte Produktionsprojekt-ID bestätigen.
2. Bewusste Risikoakzeptanz des Nutzers ohne vollständiges Backup im
   Freigabeprotokoll festhalten (kein Backup-/Restore-Nachweis erforderlich,
   §1.2). Ein Backup ist optional, aber nicht mehr Voraussetzung.
3. Nicht versionierte Produktionsdrift ist durch die beiden Reconciliation-Dateien
   (§1.1) abgebildet. Vor der Registrierung read-only nachweisen, dass deren
   beabsichtigte Endzustände produktiv vorhanden sind; keine bestehende Datei
   nachträglich ändern und die Reconciliation-Dateien produktiv nicht ausführen.
4. Arbeitsbaum muss sauber sein, HEAD und Prüfsummen müssen dem freigegebenen
   Audit-Commit entsprechen.
5. Supabase CLI 3.4.0 oder eine ausdrücklich neu geprüfte Version pinnen und bei
   jedem Befehl `--remote=ogopebvpojuvheimzged` angeben.
6. Anwendungsschreibvorgänge für das Wartungsfenster organisatorisch stoppen und
   aktive Langläufer/Locks read-only prüfen.
7. Erst nach gesonderter Produktionswrite-Freigabe die exakt auditierten **68**
   Baseline-Versionen (66 historisch + 2 Reconciliation) in **einem**
   kontrollierten `migration repair` als `applied` markieren. `migration repair`
   führt kein Migrations-SQL aus.
8. Bei Fehler oder Verbindungsabbruch nicht blind wiederholen. Zuerst
   `migration list --remote` lesen und nur tatsächlich fehlende Versionen nach
   erneuter Entscheidung reparieren.
9. Unmittelbar danach verifizieren: 68 historische/Baseline Local/Remote-Paare;
   ausschließlich die fünf CL-Versionen offen.
10. Die fünf CL-Dateien mit einem Operator in Zeitstempelreihenfolge über den
   bestehenden Remote-Migrationsworkflow anwenden.
11. Migrationshistorie, Spalten, Constraints, Trigger, Funktionssignaturen und
   ACLs erneut read-only prüfen.
12. Erst danach den Code-Commit bereitstellen. Ein Merge nach `main` löst im
   bestehenden Vercel-Git-Workflow automatisch ein Production-Deployment aus und
   darf daher nicht vor DB-Verifikation und ausdrücklicher Freigabe erfolgen.
13. Öffentliches GET-Smoke-Testing durchführen; Admin-Schreibpfade ausschließlich
   am ausdrücklich vorgesehenen Testturnier testen.

### Baseline-Befehlsschablone

Die folgende Schablone ist Dokumentation, **keine aktuelle Freigabe**. Sie
ermittelt nur die vor-CL-Dateien, stoppt bei abweichender Anzahl/Grenze und
markiert nach Bestätigung deren Versionen als angewendet:

```powershell
$baselineFiles = Get-ChildItem -LiteralPath 'supabase\migrations' -Filter '*.sql' |
  Sort-Object Name |
  Where-Object Name -LT '20261121121000_champions_league_competition_config.sql'

# 66 historische + 2 Reconciliation-Dateien (20261120120000, 20261120121000).
if ($baselineFiles.Count -ne 68) { throw 'Erwartet werden exakt 68 Baseline-Migrationen (66 historisch + 2 Reconciliation).' }
if ($baselineFiles[0].BaseName -notlike '20260819170000_*') { throw 'Unerwarteter Baseline-Anfang.' }
if ($baselineFiles[-1].BaseName -notlike '20261120121000_*') { throw 'Unerwartetes Baseline-Ende.' }

$baselineVersions = $baselineFiles.BaseName | ForEach-Object { ($_ -split '_', 2)[0] }

# Erst nach ausdrücklicher Productionwrite-Freigabe:
npx supabase migration repair @baselineVersions `
  --status applied `
  --remote=ogopebvpojuvheimzged `
  --yes
```

Werden weitere Baseline-Dateien ergänzt, müssen Anzahl, Endgrenze und
freigegebener Prüfsummenstand vor Ausführung aktualisiert werden.

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
