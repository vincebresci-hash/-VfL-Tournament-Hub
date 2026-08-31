"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { AGE_GROUPS } from "@/types/tournament";
import {
  saveTeamDirectoryEntryAction,
  updateTeamDirectoryEntryAction,
} from "@/lib/team-directory/actions";
import type { TeamDirectoryDuplicateMatch, TeamDirectorySaveInput } from "@/types/team-directory";

const selectClassName =
  "h-11 w-full border border-line bg-white px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

type TeamDirectoryFormProps = {
  initialValues: Partial<TeamDirectorySaveInput> & { id?: string };
  submitLabel: string;
  onSuccess: (entryId: string) => void;
  onCancel?: () => void;
};

function duplicateReasonLabel(reason: TeamDirectoryDuplicateMatch["matchReason"]) {
  switch (reason) {
    case "team_id":
      return "Gleiches Hub-Team";
    case "club_team_age":
      return "Gleicher Verein + Team + Altersklasse";
    case "normalized_identity":
      return "Gleiche normalisierte Identität";
    case "source_application":
      return "Gleiche Bewerbung bereits übernommen";
    default:
      return "Mögliches Duplikat";
  }
}

export function TeamDirectoryForm({
  initialValues,
  submitLabel,
  onSuccess,
  onCancel,
}: TeamDirectoryFormProps) {
  const [form, setForm] = useState({
    clubName: initialValues.clubName ?? "",
    teamName: initialValues.teamName ?? "",
    ageGroup: initialValues.ageGroup ?? "",
    contactFirstName: initialValues.contactFirstName ?? "",
    contactLastName: initialValues.contactLastName ?? "",
    contactRole: initialValues.contactRole ?? "",
    contactEmail: initialValues.contactEmail ?? "",
    contactPhone: initialValues.contactPhone ?? "",
    website: initialValues.website ?? "",
    league: initialValues.league ?? "",
    birthYear: initialValues.birthYear?.toString() ?? "",
    division: initialValues.division ?? "",
    selfRatedStrength: initialValues.selfRatedStrength?.toString() ?? "",
    internalCategory: initialValues.internalCategory ?? "",
    internalStrength: initialValues.internalStrength?.toString() ?? "",
    internalNotes: initialValues.internalNotes ?? "",
  });
  const [duplicates, setDuplicates] = useState<TeamDirectoryDuplicateMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(forceCreate = false) {
    setSaving(true);
    setError(null);
    setDuplicates([]);

    const payload: TeamDirectorySaveInput = {
      clubName: form.clubName,
      teamName: form.teamName,
      ageGroup: form.ageGroup || null,
      contactFirstName: form.contactFirstName || null,
      contactLastName: form.contactLastName || null,
      contactRole: form.contactRole || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      website: form.website || null,
      league: form.league || null,
      birthYear: form.birthYear ? Number(form.birthYear) : null,
      division: form.division || null,
      selfRatedStrength: form.selfRatedStrength ? Number(form.selfRatedStrength) : null,
      internalCategory: form.internalCategory || null,
      internalStrength: form.internalStrength ? Number(form.internalStrength) : null,
      internalNotes: form.internalNotes || null,
      sourceApplicationId: initialValues.sourceApplicationId ?? null,
      clubId: initialValues.clubId ?? null,
      teamId: initialValues.teamId ?? null,
      source: initialValues.source,
      forceCreate,
    };

    const result = initialValues.id
      ? await updateTeamDirectoryEntryAction(initialValues.id, payload)
      : await saveTeamDirectoryEntryAction(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      setDuplicates(result.duplicates ?? []);
      return;
    }

    if (result.entry) {
      onSuccess(result.entry.id);
    }
  }

  return (
    <form
      className="border border-line bg-white p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="clubName" label="Verein">
          <TextInput
            id="clubName"
            value={form.clubName}
            onChange={(event) => updateField("clubName", event.target.value)}
            required
          />
        </Field>
        <Field id="teamName" label="Team">
          <TextInput
            id="teamName"
            value={form.teamName}
            onChange={(event) => updateField("teamName", event.target.value)}
            required
          />
        </Field>
        <Field id="ageGroup" label="Altersklasse" optional>
          <select
            id="ageGroup"
            value={form.ageGroup}
            onChange={(event) => updateField("ageGroup", event.target.value)}
            className={selectClassName}
          >
            <option value="">—</option>
            {AGE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </Field>
        <Field id="league" label="Liga" optional>
          <TextInput
            id="league"
            value={form.league}
            onChange={(event) => updateField("league", event.target.value)}
          />
        </Field>
        <Field id="contactFirstName" label="Vorname Ansprechpartner" optional>
          <TextInput
            id="contactFirstName"
            value={form.contactFirstName}
            onChange={(event) => updateField("contactFirstName", event.target.value)}
          />
        </Field>
        <Field id="contactLastName" label="Nachname Ansprechpartner" optional>
          <TextInput
            id="contactLastName"
            value={form.contactLastName}
            onChange={(event) => updateField("contactLastName", event.target.value)}
          />
        </Field>
        <Field id="contactEmail" label="E-Mail" optional>
          <TextInput
            id="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={(event) => updateField("contactEmail", event.target.value)}
          />
        </Field>
        <Field id="contactPhone" label="Telefon" optional>
          <TextInput
            id="contactPhone"
            value={form.contactPhone}
            onChange={(event) => updateField("contactPhone", event.target.value)}
          />
        </Field>
        <Field id="website" label="Website" optional>
          <TextInput
            id="website"
            value={form.website}
            onChange={(event) => updateField("website", event.target.value)}
          />
        </Field>
        <Field id="internalCategory" label="Interne Kategorie" optional>
          <TextInput
            id="internalCategory"
            value={form.internalCategory}
            onChange={(event) => updateField("internalCategory", event.target.value)}
          />
        </Field>
        <Field id="internalStrength" label="Interne Spielstärke (1-5)" optional>
          <TextInput
            id="internalStrength"
            value={form.internalStrength}
            onChange={(event) => updateField("internalStrength", event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field id="internalNotes" label="Interne Notizen" optional>
          <TextAreaInput
            id="internalNotes"
            value={form.internalNotes}
            onChange={(event) => updateField("internalNotes", event.target.value)}
            rows={4}
          />
        </Field>
      </div>

      {duplicates.length > 0 ? (
        <div className="mt-6 border border-line bg-surface px-4 py-4">
          <p className="text-[14px] font-medium text-ink">Möglicherweise bereits vorhanden</p>
          <ul className="mt-3 grid gap-2">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id} className="text-[13px] text-muted">
                {duplicate.clubName} · {duplicate.teamName}
                {duplicate.ageGroup ? ` · ${duplicate.ageGroup}` : ""} —{" "}
                {duplicateReasonLabel(duplicate.matchReason)}{" "}
                <Link
                  href={`/admin/team-datenbank/${duplicate.id}`}
                  className="font-semibold text-ink uppercase hover:text-brand-blue"
                >
                  Öffnen
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={saving}
            className="mt-4 border border-line bg-white px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-60"
          >
            Trotzdem neuen Datensatz anlegen
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-yellow px-5 py-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-60"
        >
          {saving ? "Speichern…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="border border-line bg-white px-5 py-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
          >
            Abbrechen
          </button>
        ) : null}
      </div>
    </form>
  );
}
