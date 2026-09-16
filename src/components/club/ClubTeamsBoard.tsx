"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { createClubTeamAction, deleteClubTeamAction } from "@/lib/club/actions";
import { teamStrengthOptions } from "@/lib/application";
import { AGE_GROUPS } from "@/types/tournament";
import type { ClubProfile, Team } from "@/types/auth";

type ClubTeamsBoardProps = {
  club: Pick<ClubProfile, "name" | "city" | "logo">;
  teams: Team[];
};

type TeamDraft = {
  name: string;
  ageGroup: string;
  birthYear: string;
  league: string;
  strength: string;
  coach: string;
};

const emptyDraft: TeamDraft = {
  name: "",
  ageGroup: "",
  birthYear: "",
  league: "",
  strength: "",
  coach: "",
};

function sortClubTeams(teams: Team[]) {
  return [...teams].sort((a, b) => {
    const ageA = AGE_GROUPS.indexOf(a.ageGroup);
    const ageB = AGE_GROUPS.indexOf(b.ageGroup);
    const rankA = ageA < 0 ? AGE_GROUPS.length : ageA;
    const rankB = ageB < 0 ? AGE_GROUPS.length : ageB;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.name.localeCompare(b.name, "de");
  });
}

export function ClubTeamsBoard({ club, teams }: ClubTeamsBoardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TeamDraft>(emptyDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const orderedTeams = sortClubTeams(teams);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !draft.name.trim() ||
      !draft.ageGroup ||
      !draft.birthYear.trim() ||
      !draft.league.trim() ||
      !draft.strength ||
      !draft.coach.trim()
    ) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }

    const year = Number(draft.birthYear);
    if (!Number.isInteger(year) || year < 2008 || year > 2022) {
      setError("Bitte einen plausiblen Jahrgang angeben.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await createClubTeamAction({
      name: draft.name.trim(),
      ageGroup: draft.ageGroup,
      birthYear: year,
      league: draft.league.trim(),
      strength: Number(draft.strength),
      coach: draft.coach.trim(),
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setDraft(emptyDraft);
    setOpen(false);
    setNotice("Team gespeichert.");
    router.refresh();
  }

  async function handleDelete(teamId: string) {
    setError(null);
    const result = await deleteClubTeamAction(teamId);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            Meine Teams
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
            Teams deines Vereins. Die Angaben können später automatisch in neue
            Bewerbungen übernommen werden.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setNotice(null);
          }}
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Team hinzufügen
        </button>
      </div>

      {notice ? (
        <p className="mt-6 border border-line bg-white px-4 py-3 text-[13px] text-muted">
          {notice}
        </p>
      ) : null}

      <section className="mt-8 overflow-hidden border border-line bg-white shadow-sm">
        <header className="flex items-center gap-4 border-b border-line bg-surface/60 px-5 py-4 sm:px-6">
          <ParticipantClubLogo logoUrl={club.logo} clubName={club.name} size="lg" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
              Verein
            </p>
            <h2 className="mt-1 truncate font-display text-xl font-bold tracking-wide text-ink uppercase sm:text-2xl">
              {club.name}
            </h2>
            {club.city.trim() ? (
              <p className="mt-1 text-[13px] text-muted">{club.city}</p>
            ) : null}
          </div>
          <p className="ml-auto shrink-0 text-[12px] font-semibold tracking-[0.08em] text-ink/55 uppercase">
            {orderedTeams.length} {orderedTeams.length === 1 ? "Team" : "Teams"}
          </p>
        </header>

        <div className="divide-y divide-line">
          {orderedTeams.length === 0 ? (
            <p className="px-5 py-8 text-[15px] text-muted sm:px-6">
              Noch keine Teams gespeichert.
            </p>
          ) : null}

          {orderedTeams.map((team) => (
            <article key={team.id} className="px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-start gap-3">
                <ParticipantClubLogo
                  logoUrl={club.logo}
                  clubName={club.name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {team.name}
                    </h3>
                    <span className="inline-flex items-center border border-navy/15 bg-navy/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-navy uppercase">
                      {team.ageGroup}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <TeamField label="Jahrgang" value={String(team.birthYear)} />
                    {team.league.trim() ? (
                      <TeamField label="Liga" value={team.league} />
                    ) : null}
                    {team.division?.trim() ? (
                      <TeamField label="Spielklasse" value={team.division} />
                    ) : null}
                    <TeamField
                      label="Spielstärke"
                      value={`${team.strength} / 5`}
                    />
                    {team.coach.trim() ? (
                      <TeamField label="Trainer" value={team.coach} />
                    ) : null}
                  </dl>
                  <button
                    type="button"
                    onClick={() => void handleDelete(team.id)}
                    className="mt-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                  >
                    Team löschen
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {open ? (
        <form
          onSubmit={handleAdd}
          className="mt-8 grid gap-5 border border-line bg-white p-5 shadow-sm sm:p-6"
          noValidate
        >
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Neues Team
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="team-name" label="Teamname">
              <TextInput
                id="team-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            <Field id="team-age" label="Altersklasse">
              <SelectInput
                id="team-age"
                value={draft.ageGroup}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    ageGroup: event.target.value,
                  }))
                }
              >
                <option value="">Bitte auswählen</option>
                {AGE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="team-year" label="Jahrgang">
              <TextInput
                id="team-year"
                inputMode="numeric"
                value={draft.birthYear}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    birthYear: event.target.value,
                  }))
                }
              />
            </Field>
            <Field id="team-league" label="Liga">
              <TextInput
                id="team-league"
                value={draft.league}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    league: event.target.value,
                  }))
                }
              />
            </Field>
            <Field id="team-strength" label="Spielstärke Selbsteinschätzung">
              <SelectInput
                id="team-strength"
                value={draft.strength}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    strength: event.target.value,
                  }))
                }
              >
                <option value="">Bitte auswählen</option>
                {teamStrengthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="team-coach" label="Trainer">
              <TextInput
                id="team-coach"
                value={draft.coach}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    coach: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          {error ? (
            <p className="text-[13px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-70"
            >
              {submitting ? "Wird gespeichert…" : "Team hinzufügen"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function TeamField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] text-ink">{value}</dd>
    </div>
  );
}
