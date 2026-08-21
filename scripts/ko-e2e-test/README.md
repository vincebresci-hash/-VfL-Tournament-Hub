# E2E KO-Test — Ablauf (manuell)

## Warum SQL?

- Admin kann Turnier anlegen, aber **keine** 8 Gast-Bewerbungen mit `accepted` bulk erzeugen.
- Öffentliches Bewerbungsformular würde bei aktivem Resend **8 Eingangsmails** an Testadressen auslösen.
- `deleteTournamentAction` blockiert Turniere **mit Bewerbungen** → Cleanup nur per SQL sicher.

## Schritt 1 — Seed (SQL Editor)

Datei: `01-seed-test-tournament.sql` einmal ausführen.

Erwartet:
- Turnier `TEST – KO Tournament` / slug `test-ko-tournament`
- `applications_open = false` (keine echten Bewerbungen während des Tests)
- 8 accepted Gast-Apps A1–A4, B1–B4
- Gruppen A/B befüllt, Feld 1 vorhanden

## Schritt 2 — Gruppenphase (Admin-UI)

Pfad: `/admin/turniere/<id>/spielplan` bzw. Ergebnisse

1. Spielplan erzeugen (2 Gruppen × 4 Teams → **6 Spiele je Gruppe**, 12 gesamt).
2. Ergebnisse exakt so eintragen (Heim:Gast):

### Gruppe A

| Spiel | Ergebnis |
|---|---|
| A1–A2 | 3:1 |
| A1–A3 | 2:0 |
| A1–A4 | 4:0 |
| A2–A3 | 2:1 |
| A2–A4 | 3:0 |
| A3–A4 | 1:0 |

Erwartete Tabelle A: **A1 9 Pkt / +8**, **A2 6 / +2**, **A3 3 / −2**, **A4 0 / −8**

### Gruppe B

Dieselben Ergebnisse für B1–B4.

Erwartete Tabelle B: **B1 9 / +8**, **B2 6 / +2**, **B3 3 / −2**, **B4 0 / −8**

## Schritt 3 — KO erzeugen

Pfad: `/admin/turniere/<id>/ko-runde`

- Format: **4 Teams · Halbfinale**
- Spiel um Platz 3: **an**
- Platz 5/6 und 7/8: aus
- „KO-Runde erzeugen“

Erwartete Paarungen (bestehende Logik):

- HF1: **A1 vs B2**
- HF2: **B1 vs A2**
- Finale + Spiel um Platz 3 (Teams noch offen)

## Schritt 4 — Weiterrücken

1. HF1 speichern **2:1** → A1 Finale Heim, B2 Platz-3 Heim
2. HF2 speichern **1:1 + Elfmeter 5:4** → B1 Finale Auswärts, A2 Platz-3 Auswärts
3. Platz 3: z. B. **2:0**
4. Finale: z. B. **1:0**

## Schritt 5 — Ergebnisänderung

HF1 nachträglich auf **0:3** ändern (Bestätigung akzeptieren).

Erwartung:
- Finale Heim = B2
- Platz 3 Heim = A1
- vorhandene Folgeergebnisse zurückgesetzt (`scheduled`)
- keine doppelten Teams

Dann HF1/HF2/Platz3/Finale erneut sauber abschließen.

## Schritt 6 — Public

`/turniere/test-ko-tournament`

Tabs: Teilnehmer, Gruppen, Spielplan, Tabelle, KO-Runde  
Prüfen: Ergebnisse, `n.E. 5:4`, keine E-Mail/Telefon/Ansprechpartner/interne Werte.

## Schritt 7 — Abschluss

Admin: **Turnier abschließen**

Erwartung: `status=completed`, Sieger + Platzierung sichtbar, Bewerbung geschlossen, Ergebnisse weiter öffentlich.

## Schritt 8 — Cleanup

Datei: `02-cleanup-test-tournament.sql` einmal ausführen.  
Kontrolle: alle Counts = 0.
