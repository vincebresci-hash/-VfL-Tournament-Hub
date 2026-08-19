"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { AuthAlert } from "@/components/auth/AuthShell";
import { AUTH_ERROR_MESSAGES, toRegisterErrorMessage } from "@/lib/auth/messages";
import { CLUB_HOME } from "@/lib/auth/roles";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import {
  getFirstRegisterError,
  validateRegisterForm,
  type RegisterFormErrors,
  type RegisterFormValues,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";
import { CLUB_CONTACT_ROLES } from "@/types/auth";

const emptyValues: RegisterFormValues = {
  firstName: "",
  lastName: "",
  contactRole: "",
  clubName: "",
  clubCity: "",
  website: "",
  email: "",
  password: "",
  passwordConfirm: "",
  acceptedTerms: false,
};

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<RegisterFormValues>(emptyValues);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof RegisterFormValues>(
    field: K,
    value: RegisterFormValues[K],
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
    const nextErrors = validateRegisterForm(values);
    setErrors(nextErrors);
    setFormError(null);

    const firstError = getFirstRegisterError(nextErrors);
    if (firstError) {
      window.requestAnimationFrame(() => {
        const field = document.getElementById(firstError);
        field?.focus();
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/verein/dashboard")}`,
          data: {
            first_name: values.firstName.trim(),
            last_name: values.lastName.trim(),
            contact_role: values.contactRole,
            club_name: values.clubName.trim(),
            club_city: values.clubCity.trim(),
            club_website: values.website.trim() || null,
          },
        },
      });

      if (error) {
        setFormError(toRegisterErrorMessage(error.message));
        setSubmitting(false);
        return;
      }

      if (!data.session) {
        setSuccess(true);
        setSubmitting(false);
        return;
      }

      await ensureClubForCurrentUser();
      router.push(CLUB_HOME);
      router.refresh();
    } catch {
      setFormError(AUTH_ERROR_MESSAGES.registerGeneric);
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="grid gap-4">
        <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Registrierung erfolgreich
        </h2>
        <AuthAlert tone="success">
          Bitte bestätige deine E-Mail-Adresse, bevor du dich anmeldest.
        </AuthAlert>
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Zum Login →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-8">
      {formError ? <AuthAlert>{formError}</AuthAlert> : null}

      <section className="grid gap-5">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Persönliche Daten
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="firstName" label="Vorname" error={errors.firstName}>
            <TextInput
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              value={values.firstName}
              error={errors.firstName}
              onChange={(event) => update("firstName", event.target.value)}
            />
          </Field>
          <Field id="lastName" label="Nachname" error={errors.lastName}>
            <TextInput
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              value={values.lastName}
              error={errors.lastName}
              onChange={(event) => update("lastName", event.target.value)}
            />
          </Field>
        </div>
        <Field id="contactRole" label="Funktion im Verein" error={errors.contactRole}>
          <SelectInput
            id="contactRole"
            name="contactRole"
            value={values.contactRole}
            error={errors.contactRole}
            onChange={(event) => update("contactRole", event.target.value)}
          >
            <option value="">Bitte auswählen</option>
            {CLUB_CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </SelectInput>
        </Field>
      </section>

      <section className="grid gap-5 border-t border-line pt-8">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Verein
        </h2>
        <Field id="clubName" label="Vereinsname" error={errors.clubName}>
          <TextInput
            id="clubName"
            name="clubName"
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
            value={values.clubCity}
            error={errors.clubCity}
            onChange={(event) => update("clubCity", event.target.value)}
          />
        </Field>
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
      </section>

      <section className="grid gap-5 border-t border-line pt-8">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Zugang
        </h2>
        <Field id="email" label="E-Mail-Adresse" error={errors.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            error={errors.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field id="password" label="Passwort" error={errors.password}>
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            error={errors.password}
            onChange={(event) => update("password", event.target.value)}
          />
        </Field>
        <Field
          id="passwordConfirm"
          label="Passwort wiederholen"
          error={errors.passwordConfirm}
        >
          <TextInput
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            value={values.passwordConfirm}
            error={errors.passwordConfirm}
            onChange={(event) => update("passwordConfirm", event.target.value)}
          />
        </Field>

        <div>
          <label
            htmlFor="acceptedTerms"
            className="flex items-start gap-3 text-[14px] leading-6 text-ink"
          >
            <input
              id="acceptedTerms"
              name="acceptedTerms"
              type="checkbox"
              checked={values.acceptedTerms}
              onChange={(event) => update("acceptedTerms", event.target.checked)}
              aria-invalid={errors.acceptedTerms ? true : undefined}
              aria-describedby={errors.acceptedTerms ? "acceptedTerms-error" : undefined}
              className="mt-1 h-4 w-4 shrink-0 accent-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            />
            <span>
              Ich akzeptiere die{" "}
              <Link
                href="/datenschutz"
                className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
              >
                Datenschutzerklärung
              </Link>{" "}
              und{" "}
              <Link
                href="/nutzungsbedingungen"
                className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
              >
                Nutzungsbedingungen
              </Link>
              .
            </span>
          </label>
          {errors.acceptedTerms ? (
            <p
              id="acceptedTerms-error"
              className="mt-2 text-[13px] text-[#9a2b2b]"
              role="alert"
            >
              {errors.acceptedTerms}
            </p>
          ) : null}
        </div>
      </section>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
      >
        {submitting ? "Wird erstellt…" : "Konto erstellen →"}
      </button>
    </form>
  );
}
