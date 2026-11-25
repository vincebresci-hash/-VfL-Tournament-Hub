# CL Release 1.3 — bestehende Supabase Advisor-Warnungen

Stand: 25. November 2026, Produktionsprojekt `ogopebvpojuvheimzged`.

Die Advisor-Abfrage wurde read-only ausgeführt. Es wurden keine Policies,
Funktionen, Rechte oder Einstellungen verändert.

## Zusammenfassung

| Regel | Anzahl | Kategorie | Release-Relevanz |
|---|---:|---|---|
| `authenticated_security_definer_function_executable` | 62 | Security | Hoch für separates API-/ACL-Review. Viele RPCs sind absichtlich für authentifizierte Nutzer freigegeben; jede Signatur muss dennoch als API-Endpunkt betrachtet werden. Kein CL-Objekt ist aktuell produktiv vorhanden. |
| `anon_security_definer_function_executable` | 29 | Security | Hoch. Enthält bewusst öffentliche Lese-, Token- und Guest-RPCs, darf aber nicht pauschal ignoriert werden. Vor CL kein neu hinzugekommener produktiver CL-RPC. |
| `multiple_permissive_policies` | 15 | Performance | Mittel. Mehrere permissive SELECT-Policies erhöhen Auswertungskosten; kein unmittelbarer Baseline-Blocker, solange Semantik unverändert bleibt. |
| `auth_rls_initplan` | 9 | Performance | Mittel. Bestehende Auth-Ausdrücke werden pro Zeile statt als InitPlan ausgewertet. Optimierung separat und regressionstestpflichtig. |
| `function_search_path_mutable` | 7 | Security | Mittel bis hoch. Betrifft bestehende invoker-/Trigger-Helper; Search-Path-Härtung separat migrieren, nicht im Baseline-Schritt. |
| `auth_leaked_password_protection` | 1 | Security/Auth-Konfiguration | Mittel. Dashboard-/Auth-Konfiguration, keine Datenbankmigration; nur nach eigener Freigabe ändern. |
| **Gesamt** | **123** | **99 Security / 24 Performance** | Keine ungefragten Änderungen. |

## Einordnung für CL Release

- Die fünf CL-Migrationen sind noch nicht produktiv vorhanden und erzeugen
  daher in diesem Advisor-Snapshot keine CL-spezifischen Treffer.
- Die CL-Remediation setzt explizite `search_path`-Werte und engt RPC-ACLs ein;
  bestehende Warnungen werden dadurch nicht automatisch bereinigt.
- Eine Baseline markiert nur Historie. Sie darf keine Advisor-Warnung verändern
  oder als behoben darstellen.
- Die 91 SECURITY-DEFINER-Ausführbarkeitswarnungen und die zusätzlichen
  produktiven Default-ACLs gehören in ein eigenes, priorisiertes
  Berechtigungsreview. Dabei müssen öffentliche Guest-/Token-Flows erhalten
  bleiben und klassische Turniere regressionstestet werden.
- Die sieben mutable-search-path-Treffer betreffen bestehende Funktionen;
  Änderungen benötigen eigene Migrationen und Funktions-/Trigger-Tests.
- Für CL Release 2 ist die Warnungsliste kein alleiniger Blocker, solange keine
  neue CL-Warnung hinzukommt. Der fehlende Restore-Punkt und die unversionierte
  Produktionsdrift bleiben dagegen harte Blocker.

