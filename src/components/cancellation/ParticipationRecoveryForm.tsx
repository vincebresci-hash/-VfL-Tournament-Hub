"use client";

import { useState } from "react";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { requestParticipationAccessRecoveryAction } from "@/lib/cancellations/participation-recovery-actions";
import { formatDateDe } from "@/lib/format";

type RecoveryTournamentOption = {
  id: string;
  name: string;
  date: string;
};

type ParticipationRecoveryFormProps = {
  tournaments: RecoveryTournamentOption[];
};

export function ParticipationRecoveryForm({ tournaments }: ParticipationRecoveryFormProps) {
  const [tournamentId, setTournamentId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = await requestParticipationAccessRecoveryAction({
      tournamentId,
      contactEmail,
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.notice);
    setContactEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <Field id="recovery-tournament" label="Turnier">
        <SelectInput
          id="recovery-tournament"
          name="tournamentId"
          required
          value={tournamentId}
          onChange={(event) => setTournamentId(event.target.value)}
        >
          <option value="">Turnier auswählen</option>
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name} · {formatDateDe(tournament.date)}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field
        id="recovery-email"
        label="Kontakt-E-Mail der Bewerbung"
        hint="Verwendet die E-Mail-Adresse, die bei der Gastbewerbung angegeben wurde."
      >
        <TextInput
          id="recovery-email"
          name="contactEmail"
          type="email"
          autoComplete="email"
          required
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
        />
      </Field>

      {error ? (
        <p className="text-[13px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="border border-line bg-surface px-4 py-4 text-[14px] leading-6 text-ink" role="status">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Wird gesendet …" : "Link anfordern"}
      </button>
    </form>
  );
}
