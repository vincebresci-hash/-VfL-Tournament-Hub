"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/messages";
import { getLoginDestinationAction } from "@/lib/auth/login-destination-action";
import { validateNewPassword } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(AUTH_ERROR_MESSAGES.updatePasswordGeneric);
        setSubmitting(false);
        return;
      }

      const destination = await getLoginDestinationAction();
      router.push(destination);
      router.refresh();
    } catch {
      setError(AUTH_ERROR_MESSAGES.updatePasswordGeneric);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <Field id="password" label="Neues Passwort" error={undefined}>
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field id="passwordConfirm" label="Passwort wiederholen">
        <TextInput
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
      </Field>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
      >
        {submitting ? "Wird gespeichert…" : "Passwort speichern"}
      </button>
      <Link
        href="/login"
        className="text-[14px] font-medium text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
      >
        Zurück zum Login
      </Link>
    </form>
  );
}
