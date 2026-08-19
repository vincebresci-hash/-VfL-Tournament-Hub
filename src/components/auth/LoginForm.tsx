"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { AuthAlert } from "@/components/auth/AuthShell";
import { AUTH_ERROR_MESSAGES, toLoginErrorMessage } from "@/lib/auth/messages";
import { getPostLoginRedirect } from "@/lib/auth/redirects";
import { validateLoginForm, type LoginFormErrors } from "@/lib/auth/validation";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  redirectTo?: string | null;
  initialError?: string | null;
};

export function LoginForm({ redirectTo, initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [formError, setFormError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLoginForm({ email, password, remember });
    setErrors(nextErrors);
    setFormError(null);

    if (nextErrors.email || nextErrors.password) {
      const field = document.getElementById(nextErrors.email ? "email" : "password");
      field?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setFormError(toLoginErrorMessage(error.message));
        setSubmitting(false);
        return;
      }

      await ensureClubForCurrentUser();
      router.push(getPostLoginRedirect("club", redirectTo));
      router.refresh();
    } catch {
      setFormError(AUTH_ERROR_MESSAGES.generic);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {formError ? <AuthAlert>{formError}</AuthAlert> : null}

      <Field id="email" label="E-Mail-Adresse" error={errors.email}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) {
              setErrors((current) => ({ ...current, email: undefined }));
            }
          }}
        />
      </Field>

      <Field id="password" label="Passwort" error={errors.password}>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: undefined }));
            }
          }}
        />
      </Field>

      <label htmlFor="remember" className="flex items-start gap-3 text-[14px] leading-6 text-ink">
        <input
          id="remember"
          name="remember"
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        />
        <span>Angemeldet bleiben</span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
      >
        {submitting ? "Wird angemeldet…" : "Anmelden →"}
      </button>

      <div className="grid gap-2 border-t border-line pt-5 text-[14px]">
        <Link
          href="/passwort-vergessen"
          className="font-medium text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
        >
          Passwort vergessen?
        </Link>
        <p className="text-muted">
          Noch kein Konto?{" "}
          <Link
            href="/registrieren"
            className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
          >
            Jetzt registrieren
          </Link>
        </p>
      </div>
    </form>
  );
}
