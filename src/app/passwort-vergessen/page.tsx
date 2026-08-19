import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, AuthHeadline, AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthHeadline
        title="Passwort vergessen"
        subtitle="Gebt die E-Mail-Adresse eures Vereinskontos an. Wir senden einen Link zum Zurücksetzen, falls ein Konto existiert."
      />
      <AuthCard>
        <ForgotPasswordForm />
      </AuthCard>
      <Link
        href="/login"
        className="mt-6 inline-flex text-[12px] font-semibold tracking-[0.08em] text-white/70 uppercase transition-colors hover:text-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        Zurück zum Login →
      </Link>
    </AuthShell>
  );
}
