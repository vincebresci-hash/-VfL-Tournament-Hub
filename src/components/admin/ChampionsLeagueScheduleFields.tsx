"use client";

import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { adminCardShellClass } from "@/components/admin/AdminPanel";
import {
  ADMIN_COMPETITION_MODE_LABELS,
  ADMIN_COMPETITION_MODES,
  type AdminCompetitionMode,
  type ChampionsLeagueAdminDescription,
  type LeagueKnockoutCutoff,
} from "@/lib/schedule/league-admin-preview";

type ChampionsLeagueScheduleFieldsProps = {
  mode: AdminCompetitionMode;
  savedModeLabel: string;
  participantCount: number;
  participantNames: string[];
  matchesPerTeam: string;
  knockoutCutoff: LeagueKnockoutCutoff;
  description: ChampionsLeagueAdminDescription;
  onModeChange: (mode: AdminCompetitionMode) => void;
  onMatchesPerTeamChange: (value: string) => void;
  onCutoffChange: (cutoff: LeagueKnockoutCutoff) => void;
};

function countText(value: number | null) {
  return value == null ? "—" : String(value);
}

export function ChampionsLeagueScheduleFields({
  mode,
  savedModeLabel,
  participantCount,
  participantNames,
  matchesPerTeam,
  knockoutCutoff,
  description,
  onModeChange,
  onMatchesPerTeamChange,
  onCutoffChange,
}: ChampionsLeagueScheduleFieldsProps) {
  const championsLeague = mode === "champions-league";

  return (
    <div className="grid gap-4">
      <Field id="competition-mode" label="Wettbewerbsmodus">
        <SelectInput
          id="competition-mode"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as AdminCompetitionMode)}
        >
          {ADMIN_COMPETITION_MODES.map((item) => (
            <option key={item} value={item}>
              {ADMIN_COMPETITION_MODE_LABELS[item]}
            </option>
          ))}
        </SelectInput>
      </Field>
      <p className="text-[13px] leading-relaxed text-muted">
        Gespeichert bleibt {savedModeLabel}. Champions League wird nicht in das Turnier
        geschrieben und nicht aus dem öffentlichen Spielmodus abgeleitet.
      </p>

      {championsLeague ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`${adminCardShellClass} px-3.5 py-3`}>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Teilnehmende Teams
              </p>
              <p className="mt-1.5 text-[15px] text-ink">{participantCount}</p>
              <p className="mt-2 max-h-28 overflow-y-auto text-[13px] leading-relaxed text-muted">
                {participantNames.length === 0
                  ? "Keine bestätigten Teilnehmer mit gültiger Identität."
                  : participantNames.join(" · ")}
              </p>
            </div>
            <Field id="league-matches-per-team" label="Spiele pro Team">
              <TextInput
                id="league-matches-per-team"
                inputMode="numeric"
                value={matchesPerTeam}
                onChange={(event) => onMatchesPerTeamChange(event.target.value)}
              />
            </Field>
            <Field id="league-knockout-cutoff" label="K.-o.-Qualifikation">
              <SelectInput
                id="league-knockout-cutoff"
                value={String(knockoutCutoff)}
                onChange={(event) =>
                  onCutoffChange(event.target.value === "8" ? 8 : 4)
                }
              >
                <option value="4">Top 4</option>
                <option value="8">Top 8</option>
              </SelectInput>
            </Field>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className={`${adminCardShellClass} px-3.5 py-3`}>
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Erwartete Ligabegegnungen
              </dt>
              <dd className="mt-1.5 text-[15px] text-ink">
                {countText(description.expectedLeagueMatchCount)}
              </dd>
            </div>
            <div className={`${adminCardShellClass} px-3.5 py-3`}>
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Erwartete K.-o.-Spiele
              </dt>
              <dd className="mt-1.5 text-[15px] text-ink">
                {countText(description.expectedKnockoutMatchCount)}
              </dd>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Die Zahl enthält das Spiel um Platz 3. Optionale Platzierungsspiele
                um Platz 5 und Platz 7 sind nicht enthalten. Diese K.-o.-Spiele
                werden hier nicht erzeugt und nicht gespeichert.
              </p>
            </div>
          </dl>

          {participantCount % 2 === 1 ? (
            <p className="text-[13px] leading-relaxed text-muted">
              Bei ungerader Teamzahl ist eine Ligarunde ein Zyklus und kein gemeinsamer
              Anstoß. Die Vorschau plant jede Begegnung einzeln.
            </p>
          ) : null}

          {description.message ? (
            <p className={`${adminCardShellClass} border-[#e2c48a] bg-[#fff8e8] px-3.5 py-3 text-[13px] text-[#7a5a1e]`} role="alert">
              {description.message}
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              Die Konfiguration ist gültig. Die Vorschau verwendet die gespeicherten
              Spielfelder und Spielparameter.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
