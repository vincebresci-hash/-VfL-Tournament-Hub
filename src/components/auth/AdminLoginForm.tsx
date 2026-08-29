"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { Logo } from "@/components/brand/Logo";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AUTH_ERROR_MESSAGES, toLoginErrorMessage } from "@/lib/auth/messages";
import { getLoginDestinationAction } from "@/lib/auth/login-destination-action";
import { canAccessAdmin, isUserRole } from "@/lib/auth/roles";
import {
  validateAdminLoginForm,
  type AdminLoginErrors,
} from "@/lib/auth/validation";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

type AdminLoginFormProps = {
  redirectTo?: string | null;
};

export function AdminLoginForm({ redirectTo }: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AdminLoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAdminLoginForm({ email, password });
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setFormError(toLoginErrorMessage(error?.message));
        setSubmitting(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !isUserRole(profile?.role) || !canAccessAdmin(profile.role)) {
        await supabase.auth.signOut();
        setFormError(
          profileError
            ? AUTH_ERROR_MESSAGES.adminNotReady
            : "Für dieses Konto ist kein Adminzugang eingerichtet.",
        );
        setSubmitting(false);
        return;
      }

      router.refresh();
      const destination = await getLoginDestinationAction(redirectTo);
      window.location.assign(destination);
    } catch {
      setFormError(AUTH_ERROR_MESSAGES.generic);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-navy">
      <main id="inhalt" className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-[28rem]">
          <Link
            href="/"
            className="mb-10 flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            <Logo className="h-12 w-auto" />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold text-white">
                {CLUB_NAME}
              </span>
              <span className="block text-[10px] font-medium tracking-[0.12em] text-brand-yellow uppercase">
                {HUB_NAME}
              </span>
            </span>
          </Link>

          <h1 className="font-display text-4xl font-bold tracking-wide text-white uppercase">
            Admin Login
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-white/70">
            Interner Zugang für die Turnierverwaltung. Admin-Konten werden
            ausschließlich durch Super-Admins angelegt.
          </p>

          <div className="mt-8 border border-white/12 bg-white p-6 sm:p-8">
            <form onSubmit={handleSubmit} noValidate className="grid gap-5">
              {formError ? <AuthAlert>{formError}</AuthAlert> : null}
              <Field id="email" label="E-Mail" error={errors.email}>
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
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
                      setErrors((current) => ({
                        ...current,
                        password: undefined,
                      }));
                    }
                  }}
                />
              </Field>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 items-center justify-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
              >
                {submitting ? "Wird geprüft…" : "Anmelden"}
              </button>
            </form>
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex text-[12px] font-semibold tracking-[0.08em] text-white/70 uppercase transition-colors hover:text-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Zur Website →
          </Link>
        </div>
      </main>
    </div>
  );
}
