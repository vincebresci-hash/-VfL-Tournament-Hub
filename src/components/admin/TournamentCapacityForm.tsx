"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { updateTournamentMaxTeamsAction } from "@/lib/db/admin-actions";

type TournamentCapacityFormProps = {
  slug: string;
  maxTeams: number | null;
};

export function TournamentCapacityForm({
  slug,
  maxTeams,
}: TournamentCapacityFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(String(maxTeams ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const parsed = Number(value);
    const result = await updateTournamentMaxTeamsAction(slug, parsed);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Teilnehmerzahl gespeichert.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
      <Field id="max-teams" label="Maximale Teilnehmer">
        <TextInput
          id="max-teams"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
      >
        {submitting ? "Speichern…" : "Speichern"}
      </button>
      {error ? (
        <p className="sm:col-span-2 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="sm:col-span-2 text-[14px] text-muted">{notice}</p>
      ) : null}
    </form>
  );
}
