# CL Release 1.3 — Migration Baseline Audit

Stand: 25. November 2026, Branch `feature/champions-league-mode`, Commit
`ad7f800a04074908fcf10a1d25aa7dae1a7322b1`, Produktionsprojekt
`ogopebvpojuvheimzged`.

Dieser Bericht dokumentiert ausschließlich lesende Produktionsprüfungen und
isolierte lokale Tests. Es wurde kein `migration repair`, kein `db push`, keine
Migration und kein produktiver Datenexport ausgeführt.

## Methodik und Ergebnis

- Alle 66 Dateien vor den fünf CL-Migrationen wurden in Zeitstempelreihenfolge
  gelesen und gegen PostgreSQL-Kataloge der Produktion geprüft.
- Die erwartete Endlage wurde in einer isolierten, nur auf Loopback gebundenen
  PostgreSQL-18.6-Instanz rekonstruiert. Supabase-eigene `auth`-/`storage`-
  Oberflächen wurden dabei minimal lokal nachgebildet.
- Verglichen wurden Tabellen, Spalten samt Typ/Default/Nullability, Constraints,
  Funktionen samt Signatur/Sicherheitsattributen/Body-Hash, Trigger, Indizes,
  RLS, Policies, ACLs, Enums und nicht personenbezogene Seed-Fingerprints.
- Kein einziges der 1.420 erwarteten Katalog- und Seed-Objekte fehlt in
  Produktion.
- Klassifikation der 66 Dateien: **53 vollständig vorhanden**, **12 teilweise
  vorhanden**, **0 fehlend**, **1 nicht eindeutig nachweisbar**.
- „Teilweise“ bedeutet nicht, dass die Kernstruktur fehlt. Es bedeutet, dass
  mutable Seed-Daten nicht mehr vollständig vorhanden sind oder der aktuelle
  Funktionsbody von der finalen Repository-Fassung abweicht.
- Eine Übereinstimmung beweist den aktuellen Sollzustand, nicht den historischen
  Ausführungszeitpunkt. Genau deshalb darf die spätere Baseline nur kontrolliert
  und erst nach einem verifizierten Backup erfolgen.

## Festgestellte Abweichungen

### Repository-Soll fehlt nicht

Es fehlen keine erwarteten Tabellen, Spalten, Constraints, Funktionen,
Trigger, Indizes, Policies, Enums, DML-Rechte oder Seed-Schlüssel. Insbesondere
sind alle Voraussetzungen der fünf CL-Migrationen vorhanden.

### Produktionsdrift zusätzlich zum Repository

- `public.secure_access_tokens.pending_activation`
- Constraints `applications_birth_year_range` und
  `applications_guest_requires_contact_email`
- Index `applications_contact_email_idx`
- Enum-Werte `cancellation-request-confirmation` und
  `participation-access-recovery`; dadurch liegt
  `cancellation-request-submitted` in Produktion auf einer späteren Sortierung.
- Sieben zusätzliche Funktionen:
  `activate_participation_access_recovery_token`,
  `discard_participation_access_recovery_token`,
  `participation_recovery_token_expires_at`, `rls_auto_enable`,
  `rotate_participation_cancellation_token`,
  `stage_participation_access_recovery_token` und
  `upsert_status_email_template`.
- Zusätzliche Vorlage `Teilnahme-Link erneut anfordern`.
- Fünf editierbare E-Mail-Vorlagen haben andere Inhalts-Hashes als der lokale
  Migrationsendstand. Namen und Typen bleiben vorhanden.
- 364 zusätzliche Tabellenrechte aus produktiven Default-ACLs: je 17
  `MAINTAIN`/`REFERENCES`/`TRIGGER`/`TRUNCATE` für `anon`, 38/38/38/34 für
  `authenticated` und je 37 für `service_role`. Erwartete SELECT-/DML-Rechte
  fehlen nicht. Diese Drift wird nicht ungefragt geändert; `TRUNCATE` ist nicht
  durch RLS geschützt und muss in einem separaten Berechtigungsreview bewertet
  werden.
- Fünf zusätzliche EXECUTE-Grants gehören zum nicht versionierten
  Participation-Recovery-Pfad.

### Abweichende Funktionskörper

Die Signaturen, Rückgabetypen, Sprachen, `SECURITY DEFINER`-Flags,
Volatilität, Strictness, Leakproof-Flags und `search_path`-Konfigurationen sind
vorhanden; ausschließlich die normalisierten Body-Hashes weichen bei 27
Funktionen ab. Betroffen sind die unten als teilweise markierten Migrationen.
Ohne freigegebene Bereinigung wird keine Repository-Fassung über die produktive
Fassung geschrieben.

### Replay-Defekt in Migration 20

`20260825160000_participant_logos.sql` erweitert den Tabellen-Rückgabetyp von
`tournament_public_roster(text)` mit `CREATE OR REPLACE FUNCTION`. PostgreSQL
erlaubt diese Änderung des OUT-Rowtypes nicht. Ein frischer Replay stoppt dort;
lokal war ein explizites `DROP FUNCTION` vor der Datei erforderlich. Der
produktive Endzustand dieser Migration ist vollständig vorhanden, aber ohne
Migrationshistorie ist nicht eindeutig beweisbar, ob die Datei in exakt der
heutigen Form oder mit einem manuellen Zwischenschritt angewendet wurde. Die
bereits produktiv wirksame Datei wird nicht nachträglich verändert.

## Einzelprüfung aller 66 Migrationen

| # | Migration | Status | Soll/Ist-Evidenz |
|---:|---|---|---|
| 1 | `20260819170000_init_tournament_hub.sql` | Teilweise | Gesamte Grundstruktur vorhanden; von sieben historischen Demo-Turnierslugs ist aktuell nur einer vorhanden und archiviert. Mutable Seed-Daten werden nicht wieder eingespielt. |
| 2 | `20260819233000_admin_features.sql` | Vollständig | Tabellen, Spalten, Trigger, RLS, Policies, Rechte und Seed-Schlüssel vorhanden; spätere Migrationen haben Vorlagen weiterentwickelt. |
| 3 | `20260820110500_guest_applications.sql` | Vollständig | Nullable-Felder, Guest-Constraint/Policy und INSERT-Recht vorhanden. |
| 4 | `20260820114200_application_status_emails.sql` | Vollständig, später erweitert | Enum-/Log-Struktur und Vorlagen vorhanden; der damals gelöschte Helper wurde durch nicht versionierte Produktionsdrift später wieder angelegt. |
| 5 | `20260820153200_tournament_occupancy.sql` | Vollständig | RPC-Signatur, Body und anon/authenticated EXECUTE vorhanden. |
| 6 | `20260820180000_tournament_admin_fields.sql` | Vollständig | Alle Turnierfelder mit Typ, Default und Nullability vorhanden. |
| 7 | `20260820190000_tournament_schedule.sql` | Vollständig | Gruppen-, Feld-, Match- und Mitgliedsstruktur samt Constraints, Triggern, Indizes, RLS und Rechten vorhanden. |
| 8 | `20260820200000_knockout_stage.sql` | Vollständig | K.-o.-Spalten, Constraints, Trigger und Indizes vorhanden; Round-Constraint entspricht dem Vor-CL-Stand. |
| 9 | `20260820210000_app_settings_public_read.sql` | Vollständig | Öffentliche SELECT-Policy und Recht vorhanden. |
| 10 | `20260820220000_guest_application_guards.sql` | Vollständig | Guard-RPCs/-Trigger und Rechte vorhanden. |
| 11 | `20260820223000_guest_application_window_guard.sql` | Vollständig | Status-/Zeitfenster-Guard entspricht dem späteren Endstand. |
| 12 | `20260824100000_tournament_public_info.sql` | Vollständig | Öffentliche optionale Turnierfelder vorhanden. |
| 13 | `20260824210000_mein_turnierplan.sql` | Vollständig | MeinTurnierplan-Spalten vorhanden. |
| 14 | `20260824220000_mein_turnierplan_hybrid.sql` | Vollständig | Hybridquelle und Constraint vorhanden. |
| 15 | `20260825090000_mein_turnierplan_sync.sql` | Vollständig | Sync-Metadaten, External-Team-Tabelle, Constraints, Indizes, Trigger, RLS und Rechte vorhanden. |
| 16 | `20260825103000_mein_turnierplan_sync_rpc.sql` | Vollständig, überschrieben | Strukturelle Erweiterungen vorhanden; RPC wurde durch #17/#41 ersetzt. |
| 17 | `20260825120000_fix_mein_turnierplan_group_reconciliation.sql` | Vollständig, überschrieben | Fix-Wirkung ist im späteren RPC-Pfad enthalten; finaler RPC stammt aus #41. |
| 18 | `20260825140000_external_team_participation_status.sql` | Vollständig | Participation-Spalten, Constraint und Index vorhanden. |
| 19 | `20260825150000_manual_tournament_teams.sql` | Vollständig | Manuelle-Team-Spalten und Constraint vorhanden. |
| 20 | `20260825160000_participant_logos.sql` | Nicht eindeutig nachweisbar | Endzustand vollständig vorhanden; frischer Replay scheitert ohne explizites Drop der geänderten TABLE-Return-Funktion. |
| 21 | `20260825170000_club_logo_storage.sql` | Vollständig, durch #22 gehärtet | Bucket und Policies vorhanden; finale Policy-Definition stammt aus #22. |
| 22 | `20260825180000_fix_club_logo_storage_policies.sql` | Vollständig | Bucket-Konfiguration und vier Storage-Policies entsprechen dem Soll. |
| 23 | `20260825190000_guest_application_capacity_parity.sql` | Vollständig | Capacity-RPC-Endstand vorhanden. |
| 24 | `20260827200000_status_email_idempotency.sql` | Vollständig | Reservationstabelle, Indizes und RPCs vorhanden; später durch #44 erweitert. |
| 25 | `20260827210000_protect_profile_club_id.sql` | Vollständig, überschrieben | Schutzlogik wurde später in #40 ersetzt; Trigger/Funktion bestehen. |
| 26 | `20260828100000_prevent_duplicate_team_applications.sql` | Vollständig | Partial-Unique-Index vorhanden. |
| 27 | `20260828120000_guest_application_fields.sql` | Vollständig | Gastfelder und Guard-Erweiterung vorhanden. |
| 28 | `20260829120000_news_posts.sql` | Vollständig | Tabelle, Indizes, Trigger, RLS, Policies und Rechte vorhanden. |
| 29 | `20260829160000_cancellation_requests.sql` | Teilweise | Tabellen/Constraints/Trigger/Policies/Rechte vorhanden; sieben finale RPC-Bodies und vier editierbare Vorlagen weichen ab. |
| 30 | `20260829200000_payment_status.sql` | Teilweise | Spalten, Notes-Tabelle, Trigger, Policies und Rechte vorhanden; Body von `get_external_participation_payment_by_token` weicht ab. |
| 31 | `20260830120000_communication_center.sql` | Vollständig, durch #40 ersetzt | Tabellen/Struktur vorhanden; mehrere RPCs wurden final in #40 ersetzt. |
| 32 | `20260831120000_communication_receipts.sql` | Teilweise | Schema/Policies vorhanden; Bodies von `confirm_communication_receipt` und `get_communication_receipt_context` weichen ab. |
| 33 | `20260831140000_external_cancellation_email_hotfix.sql` | Teilweise | Tabellen-/Grant-Wirkung vorhanden; Bodies von `is_cancellation_workflow_template` und `reserve_external_cancellation_email_send` weichen ab. |
| 34 | `20260831150000_team_operations_p2_cleanup.sql` | Vollständig, später ersetzt | Cleanup-Objekte vorhanden; Payment-Guard wurde final in #40 ersetzt. |
| 35 | `20260831160000_user_profiles_rbac.sql` | Vollständig, später gehärtet | Alle RBAC-Tabellen, Constraints, Indizes, Policies, Rechte und Seed-Fingerprints vorhanden; Helper später ersetzt. |
| 36 | `20260831170000_rbac_enforcement_aliases.sql` | Vollständig | Alias-Permissions und Zuordnungen vorhanden. |
| 37 | `20260831180000_user_management_invitations.sql` | Vollständig | Tabellen, Trigger, RLS, Policies, Avatar-Bucket und Policies vorhanden. |
| 38 | `20260831190000_invitation_service_role_grants.sql` | Vollständig, später gehärtet | Service-Role-Rechte vorhanden; Profile-Guard später ersetzt. |
| 39 | `20260831200000_rbac_accept_pending_invitation.sql` | Teilweise | Signatur, Sicherheitsattribute und Rechte vorhanden; Funktionsbody weicht ab. |
| 40 | `20260831210000_rbac_domain_rls_enforcement.sql` | Teilweise | Sämtliche Policies/Grants/Trigger vorhanden; acht finale Helper-/RPC-Bodies weichen ab. |
| 41 | `20260831220000_rbac_security_definer_hardening.sql` | Teilweise | ACL-/Security-Attribute vorhanden; finaler MeinTurnierplan-Sync-Body weicht ab. |
| 42 | `20260831230000_communication_recipient_email_dedup.sql` | Teilweise | Index/Constraint-Wirkung vorhanden; Body von `resolve_communication_recipients` weicht ab. |
| 43 | `20260831240000_team_directory.sql` | Vollständig | Tabelle, Indizes, Trigger, RLS, Policies und Rechte vorhanden. |
| 44 | `20260831250000_status_email_reservation_lease.sql` | Vollständig | Lease-Spalten, Constraints, Indizes und V2-RPCs vorhanden. |
| 45 | `20260831260000_public_tournament_anon_visibility.sql` | Vollständig | anon EXECUTE auf den bestehenden Sichtbarkeitshelper vorhanden. |
| 46 | `20260831270000_communication_team_directory_recipients.sql` | Vollständig | Recipient-RPC-Endstand und Rechte vorhanden. |
| 47 | `20260831280000_communication_pending_recipients_rpc.sql` | Vollständig | Pending-RPC samt ACL vorhanden. |
| 48 | `20260901120000_communication_pr42_send_incident_fix.sql` | Vollständig | Zusätzliche SELECT-Policies vorhanden. |
| 49 | `20260901130000_communication_confirmation_tokens_platform_scope.sql` | Vollständig | Platform-scope Policy vorhanden. |
| 50 | `20260901140000_communication_table_select_grants.sql` | Vollständig | Erwartete SELECT-Rechte vorhanden. |
| 51 | `20260911120000_applications_archived_at.sql` | Vollständig | Nullable `archived_at` samt Index vorhanden. |
| 52 | `20260911153000_application_hard_delete_dependency_counts_rpc.sql` | Vollständig | RPC-Signatur, Body, Security und ACL vorhanden. |
| 53 | `20260913200000_application_participant_logos.sql` | Vollständig | Logo-Spalten/Index und Public-Roster-Endstand vorhanden. |
| 54 | `20260914180000_team_directory_logo_hard_delete.sql` | Vollständig | `logo_url` und DELETE-Policy/Recht vorhanden. |
| 55 | `20260916190000_communication_table_update_grant.sql` | Vollständig | authenticated UPDATE vorhanden. |
| 56 | `20260916210000_hard_delete_archived_communication_rpc.sql` | Vollständig | RPC und restriktive ACL vorhanden. |
| 57 | `20260917120000_tournaments_allow_multiple_teams.sql` | Vollständig | Spalte mit Typ/Default/Nullability vorhanden. |
| 58 | `20260917140000_multi_team_application_rpcs.sql` | Vollständig | Beide Batch-RPCs und ACLs vorhanden. |
| 59 | `20260918140000_guest_cancellation_recovery.sql` | Teilweise | Tabellen-/Index-/ACL-Wirkung vorhanden; zwei RPC-Bodies weichen ab und Produktion enthält einen zusätzlichen, nicht versionierten Recovery-Pfad. |
| 60 | `20260918180000_guest_cancellation_recovery_tournaments.sql` | Vollständig | Metadaten-RPC und ACL vorhanden. |
| 61 | `20260918200000_partners_management_v1.sql` | Vollständig | Tabelle, Trigger, RLS, Policies, ACLs und Bucket vorhanden. |
| 62 | `20260918210000_tournament_partners_phase2a.sql` | Vollständig | Join-Tabelle, Constraints, Indizes, RLS, Policies und ACLs vorhanden. |
| 63 | `20260919200000_set_tournament_partner_assignments_rpc.sql` | Teilweise | Signatur, Security und ACL vorhanden; Funktionsbody weicht ab. |
| 64 | `20261007120000_tournament_lifecycle_state.sql` | Vollständig | Lifecycle-Spalten und Constraints vorhanden. |
| 65 | `20261008140000_admin_nav_seen_state.sql` | Teilweise | Tabelle/Policies/Indizes/ACLs vorhanden; drei Admin-Nav-RPC-Bodies weichen ab. |
| 66 | `20261009150000_ionos_inbox_readonly.sql` | Vollständig | Inbox-Tabellen, Constraints, Indizes, RLS, Policies, RPCs, ACLs und Bucket vorhanden. |

## Lokaler Replay- und Restore-Test

- Migrationen 1–19 liefen auf der isolierten Instanz durch.
- Migration 20 stoppte reproduzierbar wegen des geänderten TABLE-Return-Typs.
- Nach dem ausschließlich lokalen, dokumentierten `DROP FUNCTION` liefen 20–66
  vollständig durch.
- Ein Custom-Format-Dump der synthetischen lokalen Rekonstruktion wurde in eine
  zweite lokale Datenbank restauriert.
- Vergleich Quelle/Restore: 1.420 zu 1.420 Objekte, 0 fehlend, 0 zusätzlich,
  0 Fingerprint-Abweichungen.
- Dieser Test enthält keine produktiven Daten und ersetzt keinen Restore-Test
  eines vollständigen produktiven Exports, insbesondere nicht für Auth und
  Storage-Dateien.

## Baseline-Empfehlung

Die 66 Versionen können fachlich als historische Baseline markiert werden,
weil keine erwartete Voraussetzung fehlt. Das ist jedoch erst freigabefähig,
wenn zwei zusätzliche Bedingungen erfüllt sind:

1. Ein verschlüsselter vollständiger Export einschließlich Auth-Daten,
   Storage-Metadaten und separater Storage-Dateien wurde erfolgreich in einer
   isolierten Umgebung restauriert und verifiziert.
2. Die nicht versionierte Produktionsdrift wurde bewusst entschieden: entweder
   als vor-CL Drift-Capture-Migration ins Repository übernommen und zusammen mit
   den 66 Versionen baselined oder ausdrücklich als dokumentierte Abweichung
   akzeptiert. Ein unkontrolliertes Überschreiben durch alte Funktionskörper ist
   ausgeschlossen.

Bis dahin gilt: **NO-GO für `migration repair` und NO-GO für die fünf
CL-Migrationen**.

