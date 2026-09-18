"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import {
  requestGuestCancellationRecoveryAction,
} from "@/lib/cancellations/recovery-actions";
import { GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE } from "@/lib/cancellations/recovery-constants";

export type RecoveryTournamentOption = {
  id: string;
  label: string;
};

type GuestCancellationRecoveryFormProps = {
  tournaments: RecoveryTournamentOption[];
};

type FieldErrors = {
  tournamentId?: string;
  clubName?: string;
  teamName?: string;
  contactEmail?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function GuestCancellationRecoveryForm({
  tournaments,
}: GuestCancellationRecoveryFormProps) {
  const formId = useId();
  const [tournamentId, setTournamentId] = useState("");
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!tournamentId.trim()) {
      next.tournamentId = "Bitte wählt ein Turnier aus.";
    }
    if (!clubName.trim()) {
      next.clubName = "Bitte gebt den Vereinsnamen an.";
    }
    if (!teamName.trim()) {
      next.teamName = "Bitte gebt den Mannschaftsnamen an.";
    }
    if (!contactEmail.trim()) {
      next.contactEmail = "Bitte gebt die Bewerbungs-E-Mail-Adresse an.";
    } else if (!isValidEmail(contactEmail)) {
      next.contactEmail = "Bitte gebt eine gültige E-Mail-Adresse an.";
    }
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    setGenericError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await requestGuestCancellationRecoveryAction({
          tournamentId: tournamentId.trim(),
          clubName: clubName.trim(),
          teamName: teamName.trim(),
          contactEmail: contactEmail.trim(),
          honeypot,
        });
        setSuccessMessage(
          result.message || GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE,
        );
        setErrors({});
      } catch {
        setGenericError(
          "Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versucht es später erneut.",
        );
      }
    });
  }

  if (successMessage) {
    return (
      <div
        className="border border-line bg-background p-5 sm:p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Anfrage gesendet
        </p>
        <p className="mt-3 text-[15px] leading-7 text-ink">{successMessage}</p>
        <p className="mt-4 text-[14px] leading-6 text-muted">
          Prüft bitte euer Postfach und ggf. den Spam-Ordner. Über den Link in
          der E-Mail könnt ihr anschließend eine Absageanfrage stellen.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="relative grid gap-5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden opacity-0"
      >
        <label htmlFor={`${formId}-companyWebsite`}>Firmenwebseite</label>
        <input
          id={`${formId}-companyWebsite`}
          name="companyWebsite"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      {genericError ? (
        <p
          className="border border-line bg-surface px-4 py-3 text-[13px] text-[#9a2b2b]"
          role="alert"
        >
          {genericError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <label
          htmlFor={`${formId}-tournamentId`}
          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Turnier
        </label>
        <select
          id={`${formId}-tournamentId`}
          name="tournamentId"
          value={tournamentId}
          disabled={pending}
          onChange={(event) => setTournamentId(event.target.value)}
          aria-invalid={Boolean(errors.tournamentId)}
          aria-describedby={
            errors.tournamentId ? `${formId}-tournamentId-error` : undefined
          }
          className="h-11 w-full border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-navy disabled:opacity-60"
        >
          <option value="">Turnier auswählen</option>
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.label}
            </option>
          ))}
        </select>
        {errors.tournamentId ? (
          <p
            id={`${formId}-tournamentId-error`}
            className="text-[13px] text-[#9a2b2b]"
            role="alert"
          >
            {errors.tournamentId}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label
          htmlFor={`${formId}-clubName`}
          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Verein
        </label>
        <input
          id={`${formId}-clubName`}
          name="clubName"
          type="text"
          autoComplete="organization"
          placeholder="z. B. FC Esslingen"
          value={clubName}
          disabled={pending}
          onChange={(event) => setClubName(event.target.value)}
          aria-invalid={Boolean(errors.clubName)}
          aria-describedby={
            errors.clubName ? `${formId}-clubName-error` : undefined
          }
          className="h-11 w-full border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-navy disabled:opacity-60"
        />
        {errors.clubName ? (
          <p
            id={`${formId}-clubName-error`}
            className="text-[13px] text-[#9a2b2b]"
            role="alert"
          >
            {errors.clubName}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label
          htmlFor={`${formId}-teamName`}
          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Mannschaft
        </label>
        <input
          id={`${formId}-teamName`}
          name="teamName"
          type="text"
          autoComplete="off"
          placeholder="z. B. U13 / Team I"
          value={teamName}
          disabled={pending}
          onChange={(event) => setTeamName(event.target.value)}
          aria-invalid={Boolean(errors.teamName)}
          aria-describedby={
            errors.teamName
              ? `${formId}-teamName-error ${formId}-teamName-help`
              : `${formId}-teamName-help`
          }
          className="h-11 w-full border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-navy disabled:opacity-60"
        />
        <p id={`${formId}-teamName-help`} className="text-[13px] text-muted">
          Bei mehreren Mannschaften denselben Namen wie in der Bewerbung
          verwenden (z. B. Team I oder Team II getrennt).
        </p>
        {errors.teamName ? (
          <p
            id={`${formId}-teamName-error`}
            className="text-[13px] text-[#9a2b2b]"
            role="alert"
          >
            {errors.teamName}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label
          htmlFor={`${formId}-contactEmail`}
          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Bewerbungs-E-Mail-Adresse
        </label>
        <input
          id={`${formId}-contactEmail`}
          name="contactEmail"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@verein.de"
          value={contactEmail}
          disabled={pending}
          onChange={(event) => setContactEmail(event.target.value)}
          aria-invalid={Boolean(errors.contactEmail)}
          aria-describedby={
            errors.contactEmail
              ? `${formId}-contactEmail-error ${formId}-contactEmail-help`
              : `${formId}-contactEmail-help`
          }
          className="h-11 w-full border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-navy disabled:opacity-60"
        />
        <p id={`${formId}-contactEmail-help`} className="text-[13px] text-muted">
          Verwendet die E-Mail-Adresse, die bei der Bewerbung angegeben wurde.
        </p>
        {errors.contactEmail ? (
          <p
            id={`${formId}-contactEmail-error`}
            className="text-[13px] text-[#9a2b2b]"
            role="alert"
          >
            {errors.contactEmail}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-11 w-full items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Wird gesendet…" : "Zugangslink anfordern"}
      </button>
    </form>
  );
}
