"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/messages";
import {
  validateForgotPasswordForm,
  type ForgotPasswordErrors,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<ForgotPasswordErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateForgotPasswordForm({ email });
    setErrors(nextErrors);

    if (nextErrors.email) {
      document.getElementById("email")?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/passwort-zuruecksetzen")}`,
      });
    } catch {
      // Always show the same confirmation to avoid account enumeration.
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return <AuthAlert tone="success">{AUTH_ERROR_MESSAGES.resetGeneric}</AuthAlert>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
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
              setErrors({});
            }
          }}
        />
      </Field>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
      >
        {submitting ? "Wird gesendet…" : "Link anfordern"}
      </button>
    </form>
  );
}
