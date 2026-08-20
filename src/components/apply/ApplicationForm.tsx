"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Field,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "@/components/apply/FormControls";
import {
  IconCheck,
  IconClipboard,
  IconClubs,
  IconMessage,
  IconShield,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  clubTypeOptions,
  createEmptyApplicationForm,
  getFirstApplicationError,
  teamStrengthOptions,
  validateApplicationForm,
  type ApplicationFormErrors,
  type ApplicationFormValues,
} from "@/lib/application";
import { submitTournamentApplicationAction } from "@/lib/applications/actions";
import type { Team } from "@/types/auth";
import type { AgeGroup } from "@/types/tournament";

type ApplicationFormProps = {
  tournamentId: string;
  tournamentSlug: string;
  ageGroup: AgeGroup;
  prefill?: Partial<ApplicationFormValues>;
  teams?: Team[];
};

export function ApplicationForm({
  tournamentSlug,
  ageGroup,
  prefill,
  teams = [],
}: ApplicationFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ApplicationFormValues>(() => ({
    ...createEmptyApplicationForm(ageGroup),
    ...prefill,
    ageGroup,
  }));
  const [selectedTeamId, setSelectedTeamId] = useState(prefill && teams[0] ? teams.find((team) => team.name === prefill.teamName)?.id ?? "" : "");
  const [errors, setErrors] = useState<ApplicationFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof ApplicationFormValues>(
    field: K,
    value: ApplicationFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateApplicationForm(values);
    setErrors(nextErrors);
    setFormError(null);

    const firstError = getFirstApplicationError(nextErrors);
    if (firstError) {
      window.requestAnimationFrame(() => {
        const field = document.getElementById(firstError);
        field?.focus();
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setSubmitting(true);
    const result = await submitTournamentApplicationAction({
      tournamentSlug,
      teamId: selectedTeamId || null,
      values: { ...values, ageGroup },
    });

    if (result.error) {
      setFormError(result.error);
      setSubmitting(false);
      return;
    }

    router.push("/bewerbung-erfolgreich");
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="relative rounded-[12px] border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden opacity-0"
      >
        <label htmlFor="companyWebsite">Firmenwebseite</label>
        <input
          id="companyWebsite"
          name="companyWebsite"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.honeypot}
          onChange={(event) => update("honeypot", event.target.value)}
        />
      </div>
      {formError ? (
        <p className="mb-6 border border-line bg-surface px-4 py-3 text-[13px] text-[#9a2b2b]" role="alert">
          {formError}
        </p>
      ) : null}

      <FormSection title="Verein" icon={<IconClubs className="h-4 w-4 text-brand-yellow" />}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="clubName" label="Vereinsname" error={errors.clubName}>
            <TextInput
              id="clubName"
              name="clubName"
              autoComplete="organization"
              placeholder="VfL Kirchheim"
              value={values.clubName}
              error={errors.clubName}
              onChange={(event) => update("clubName", event.target.value)}
            />
          </Field>
          <Field id="clubCity" label="Ort" error={errors.clubCity}>
            <TextInput
              id="clubCity"
              name="clubCity"
              autoComplete="address-level2"
              placeholder="Kirchheim unter Teck"
              value={values.clubCity}
              error={errors.clubCity}
              onChange={(event) => update("clubCity", event.target.value)}
            />
          </Field>
        </div>
        <Field id="website" label="Vereinswebsite" optional error={errors.website}>
          <TextInput
            id="website"
            name="website"
            inputMode="url"
            placeholder="www.verein.de"
            value={values.website}
            error={errors.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </Field>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Vereinslogo
            <span className="ml-3 font-medium tracking-[0.08em] text-muted normal-case">
              Optional
            </span>
          </p>
          <div className="mt-2 flex h-28 items-center justify-center border border-dashed border-line bg-surface px-4 text-center">
            <p className="text-[12px] leading-5 tracking-[0.06em] text-muted uppercase">
              Logo-Upload folgt später
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Mannschaft" icon={<IconUsers className="h-4 w-4 text-brand-yellow" />}>
        {teams.length > 0 ? (
          <Field id="existingTeam" label="Vorhandenes Team" optional>
            <SelectInput
              id="existingTeam"
              value={selectedTeamId}
              onChange={(event) => {
                const teamId = event.target.value;
                setSelectedTeamId(teamId);
                const team = teams.find((item) => item.id === teamId);
                if (!team) {
                  return;
                }
                setValues((current) => ({
                  ...current,
                  teamName: team.name,
                  birthYear: String(team.birthYear),
                  league: team.league,
                  division: team.division ?? "",
                  selfRatedStrength: String(team.strength),
                }));
              }}
            >
              <option value="">Neues Team / Angaben unten</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · {team.ageGroup}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <Field id="teamName" label="Mannschaftsname" error={errors.teamName}>
          <TextInput
            id="teamName"
            name="teamName"
            placeholder="VfL Kirchheim U10"
            value={values.teamName}
            error={errors.teamName}
            onChange={(event) => update("teamName", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Altersklasse
          </p>
          <p className="mt-2 flex h-11 items-center border border-line bg-surface px-3 text-[15px] text-muted">
            {ageGroup}
          </p>
        </div>
          <Field id="birthYear" label="Jahrgang" error={errors.birthYear}>
            <TextInput
              id="birthYear"
              name="birthYear"
              inputMode="numeric"
              placeholder="2016"
              value={values.birthYear}
              error={errors.birthYear}
              onChange={(event) => update("birthYear", event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="league" label="Aktuelle Spielklasse / Liga" error={errors.league}>
            <TextInput
              id="league"
              name="league"
              placeholder="Bezirksstaffel"
              value={values.league}
              error={errors.league}
              onChange={(event) => update("league", event.target.value)}
            />
          </Field>
          <Field id="division" label="Staffel / Gruppe" optional>
            <TextInput
              id="division"
              name="division"
              placeholder="Staffel 2"
              value={values.division}
              onChange={(event) => update("division", event.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Spielstärke" icon={<IconTrophy className="h-4 w-4 text-brand-yellow" />}>
        <Field
          id="selfRatedStrength"
          label="Wie schätzt ihr eure Spielstärke ein?"
          error={errors.selfRatedStrength}
          hint="Die Angabe dient ausschließlich zur sportlich passenden Zusammenstellung des Turniers."
        >
          <SelectInput
            id="selfRatedStrength"
            name="selfRatedStrength"
            value={values.selfRatedStrength}
            error={errors.selfRatedStrength}
            onChange={(event) => update("selfRatedStrength", event.target.value)}
          >
            <option value="">Bitte auswählen</option>
            {teamStrengthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="teamDescription" label="Kurze Beschreibung der Mannschaft" optional>
          <TextAreaInput
            id="teamDescription"
            name="teamDescription"
            placeholder="Leistungsstarker 2016er Jahrgang, spielt überwiegend gegen ältere Mannschaften."
            value={values.teamDescription}
            onChange={(event) => update("teamDescription", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Vereinskategorie" icon={<IconShield className="h-4 w-4 text-brand-yellow" />}>
        <Field
          id="clubType"
          label="Art des Vereins"
          optional
          hint="Diese Angabe dient nur als Information. Die interne Einstufung erfolgt durch den VfL."
        >
          <SelectInput
            id="clubType"
            name="clubType"
            value={values.clubType}
            onChange={(event) => update("clubType", event.target.value)}
          >
            <option value="">Keine Angabe</option>
            {clubTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </FormSection>

      <FormSection title="Ansprechpartner" icon={<IconMessage className="h-4 w-4 text-brand-yellow" />}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="contactFirstName" label="Vorname" error={errors.contactFirstName}>
            <TextInput
              id="contactFirstName"
              name="contactFirstName"
              autoComplete="given-name"
              value={values.contactFirstName}
              error={errors.contactFirstName}
              onChange={(event) => update("contactFirstName", event.target.value)}
            />
          </Field>
          <Field id="contactLastName" label="Nachname" error={errors.contactLastName}>
            <TextInput
              id="contactLastName"
              name="contactLastName"
              autoComplete="family-name"
              value={values.contactLastName}
              error={errors.contactLastName}
              onChange={(event) => update("contactLastName", event.target.value)}
            />
          </Field>
        </div>
        <Field id="contactRole" label="Funktion im Verein" error={errors.contactRole}>
          <TextInput
            id="contactRole"
            name="contactRole"
            placeholder="Trainer, Jugendleiter, Koordinator"
            value={values.contactRole}
            error={errors.contactRole}
            onChange={(event) => update("contactRole", event.target.value)}
          />
        </Field>
        <Field id="contactEmail" label="E-Mail-Adresse" error={errors.contactEmail}>
          <TextInput
            id="contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="email"
            value={values.contactEmail}
            error={errors.contactEmail}
            onChange={(event) => update("contactEmail", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="contactPhone" label="Telefonnummer" error={errors.contactPhone}>
            <TextInput
              id="contactPhone"
              name="contactPhone"
              type="tel"
              autoComplete="tel"
              placeholder="07121 123456"
              value={values.contactPhone}
              error={errors.contactPhone}
              onChange={(event) => update("contactPhone", event.target.value)}
            />
          </Field>
          <Field id="alternativePhone" label="Alternative Telefonnummer" optional error={errors.alternativePhone}>
            <TextInput
              id="alternativePhone"
              name="alternativePhone"
              type="tel"
              autoComplete="tel"
              value={values.alternativePhone}
              error={errors.alternativePhone}
              onChange={(event) => update("alternativePhone", event.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Turnierbezogene Informationen" icon={<IconClipboard className="h-4 w-4 text-brand-yellow" />}>
        <Field id="staffCount" label="Anzahl Begleitpersonen / Trainer" optional error={errors.staffCount}>
          <TextInput
            id="staffCount"
            name="staffCount"
            inputMode="numeric"
            placeholder="3"
            value={values.staffCount}
            error={errors.staffCount}
            onChange={(event) => update("staffCount", event.target.value)}
          />
        </Field>
        <Field id="notes" label="Besondere Hinweise" optional>
          <TextAreaInput
            id="notes"
            name="notes"
            placeholder="Weitere Mannschaft desselben Vereins, längere Anreise oder organisatorische Hinweise."
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Datenschutz und Bestätigung" icon={<IconCheck className="h-4 w-4 text-brand-yellow" />} last>
        <CheckboxField
          id="dataAccurate"
          checked={values.dataAccurate}
          error={errors.dataAccurate}
          onChange={(checked) => update("dataAccurate", checked)}
        >
          Ich bestätige, dass die angegebenen Daten korrekt sind und zur
          Bearbeitung der Turnierbewerbung verwendet werden dürfen.
        </CheckboxField>
        <CheckboxField
          id="privacyAccepted"
          checked={values.privacyAccepted}
          error={errors.privacyAccepted}
          onChange={(checked) => update("privacyAccepted", checked)}
        >
          Ich habe die{" "}
          <Link
            href="/datenschutz"
            className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
          >
            Datenschutzerklärung
          </Link>{" "}
          gelesen.
        </CheckboxField>
      </FormSection>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 inline-flex h-12 w-full items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70 sm:w-auto"
      >
        {submitting ? "Wird gesendet…" : "Bewerbung senden →"}
      </button>
    </form>
  );
}

function FormSection({
  title,
  icon,
  children,
  last = false,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section className={cn("grid gap-5", !last && "mb-8 border-b border-line pb-8")}>
      <h2 className="flex items-center gap-2.5 font-display text-lg font-bold tracking-wide text-ink uppercase">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckboxField({
  id,
  checked,
  error,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 text-[14px] leading-6 text-ink">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 h-4 w-4 shrink-0 accent-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-[13px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
