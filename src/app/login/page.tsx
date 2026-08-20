import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, AuthHeadline, AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/messages";
import { getPostLoginRedirect, readRedirectParam } from "@/lib/auth/redirects";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Vereins-Login" };

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string | string[]; error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = readRedirectParam(params.redirect);
  const errorParam = readRedirectParam(params.error);
  const session = await getAuthSession();

  if (session) {
    redirect(getPostLoginRedirect(session.user.role, redirectTo));
  }

  return (
    <AuthShell>
      <AuthHeadline title="Vereins-Login" />
      <AuthCard>
        <LoginForm
          redirectTo={redirectTo}
          initialError={errorParam ? AUTH_ERROR_MESSAGES.callbackFailed : null}
        />
      </AuthCard>
      <Link
        href="/registrieren"
        className="mt-6 inline-flex h-12 w-full items-center justify-center border border-white/35 px-5 text-[13px] font-semibold tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        Vereinskonto erstellen
      </Link>
    </AuthShell>
  );
}
