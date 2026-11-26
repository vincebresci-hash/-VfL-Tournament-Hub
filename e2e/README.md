# CL Release 5 — isolierte Browser-Abnahme

Diese Suite prüft die Admin-Spielplanverwaltung in echtem Chromium. Sie läuft
ausschließlich gegen einen wegwerfbaren Supabase-Stack auf einem
GitHub-hosted Ubuntu-24.04-Runner. Lokales Docker unter Windows wird nicht
benötigt und für diese Abnahme nicht gestartet oder repariert.

## Sicherheitsgrenze

- Workflow: `.github/workflows/cl-release-5-e2e.yml`
- Trigger: `workflow_dispatch`; solange die Workflow-Datei noch nicht auf dem
  Default-Branch registriert ist, zusätzlich ausschließlich Pushes auf
  `fix/cl-release-5-admin-schedule`
- GitHub-Berechtigung: nur `contents: read`, Checkout ohne persistierte
  Credentials
- keine GitHub-Environments und keine Repository-Secrets
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` und `DATABASE_URL` müssen leer
  sein
- `supabase/config.toml` muss `project_id = "vfl-tournament-hub-local"` und
  PostgreSQL 17 enthalten
- vor der ersten Anwendungsschreiboperation prüft
  `e2e/verify-local-environment.mjs` API- und Datenbank-URL, feste Localhost-Ports
  und die tatsächliche PostgreSQL-Hauptversion
- jeder Verweis auf `ogopebvpojuvheimzged`, `*.supabase.co` oder eine Remote-DB
  bricht den Lauf ab
- der lokale Stack wird am Ende mit `supabase stop --no-backup` verworfen

Die Test-Anmeldedaten (`@example.test`) und sämtliche Vereine, Teams und
Turniere sind synthetisch. Desktop und Mobile erhalten jeweils eigene
Turniere, damit parallele Browser keine gemeinsamen Daten verändern.

## Automatisierte Abdeckung

Der Test läuft in Desktop Chrome und einer mobilen Pixel-7-Emulation:

1. Spielzeit, Wechselzeit und Mindestruhezeit speichern und nach Reload prüfen.
2. Same-Club-Fail-safe bei zehn fehlenden Vereinsidentitäten; Vorschau bleibt
   gesperrt.
3. Direkte Vereinszuordnung für eine bestätigte Bewerbung auf der
   Spielplanseite; Link zur Teilnehmerverwaltung bleibt sichtbar.
4. Zehn Teams, vier Spiele pro Team, exakt 20/20 Ligabegegnungen.
5. Abstände je Feld (`Spielzeit + Wechselzeit`) und je Team (`Spielzeit +
   Mindestruhezeit`).
6. Same-Club-Auslosung: jede Begegnung verbindet einen synthetischen Blue- mit
   einem Yellow-Club-Teilnehmer.
7. Änderung von Reihenfolge, Anstoßzeit und Spielfeld vor der Übernahme.
8. Vollständige Übernahme, Reload und Persistenzprüfung aller 20 Spiele.
9. PDF-Druckansicht mit 20 Spielen sowie echte Chromium-PDF-Erzeugung.
10. Benannte Desktop- und Mobile-Screenshots, HTML-Report, Traces bei Fehlern und
    PDF-Dateien als GitHub-Actions-Artefakt.

## Vereinszuordnung: erwartetes Verhalten

Bestätigte Bewerbungen mit `applicationId` können direkt auf der
Spielplanseite im Abschnitt **Vereinszuordnung** bearbeitet werden. Die Aktion
verwendet denselben autorisierten Serverpfad wie die Teilnehmerverwaltung und
setzt nie automatisch einen unsicheren Vorschlag.

Externe Teilnehmer ohne zuordenbare Bewerbung sind dort nicht inline
schreibbar; die UI verweist für sie ausdrücklich auf die Teilnehmerverwaltung.
Die Same-Club-Vorschau bleibt bei jeder fehlenden stabilen Vereinsidentität
gesperrt.

## Artefakte und Ergebnisinterpretation

Der Workflow lädt `e2e/screenshots/`, `e2e/playwright-report/` und
`e2e/test-results/` für 14 Tage als `cl5-e2e-artifacts` hoch. Ein grüner Lauf
bedeutet, dass alle acht Browserfälle (vier Szenarien × zwei Viewports) auf dem
isolierten PostgreSQL-17/Supabase-Stack bestanden haben. Fehlgeschlagene oder
nicht gestartete Fälle sind im HTML-Report und im Abnahmebericht einzeln zu
dokumentieren.

Falls der GitHub-Runner den lokalen Stack nicht vollständig starten kann, darf
nicht auf Produktion oder ein anderes Remote-Projekt ausgewichen werden. Dann
ist nur eine manuelle, nicht schreibende Prüfung zulässig: Produktions-Preview
öffnen, ohne Anmeldung öffentliche Seiten und vorhandene veröffentlichte
Spielpläne ansehen, Browserbreiten Desktop/Mobile prüfen und keinerlei Formulare
absenden oder Daten verändern.
