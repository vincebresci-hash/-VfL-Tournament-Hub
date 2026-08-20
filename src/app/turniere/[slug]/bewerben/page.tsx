import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ApplicationForm } from "@/components/apply/ApplicationForm";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { canAccessClub } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { getApplicationPrefill, loadClubWorkspace } from "@/lib/club/workspace";
import { getTournamentOccupancy } from "@/lib/db/queries";
import { getPublicTournamentBySlug } from "@/lib/db/tournament-queries";
import { formatDateDe } from "@/lib/format";
import {
  getPublicApplicationState,
} from "@/lib/public-application-state";
import { getAppSettings } from "@/lib/settings";
import type { PublicTournament } from "@/types/tournament";

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getPublicTournamentBySlug(slug);

  return {
    title: tournament ? `Bewerbung · ${tournament.name}` : "Bewerbung",
  };
}

export default async function TournamentApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const tournament = await getPublicTournamentBySlug(slug);

  if (!tournament) {
    notFound();
  }

  const session = await getAuthSession();
  const workspace =
    session && canAccessClub(session.user.role)
      ? await loadClubWorkspace(session)
      : null;
  const prefill = workspace
    ? getApplicationPrefill(workspace, tournament.ageGroup)
    : undefined;
  const settings = await getAppSettings();
  const occupancy = await getTournamentOccupancy(tournament.slug);
  const applicationState = getPublicApplicationState({
    status: tournament.status,
    applicationsEnabled: settings.applicationsEnabled,
    applicationsOpen: tournament.applicationsOpen,
    availableSlots: occupancy?.availableSlots ?? tournament.availableSlots,
    waitlistEnabled: settings.waitlistEnabled && tournament.waitlistEnabled,
    isFull: occupancy?.isFull ?? tournament.isFull,
    applicationStart: tournament.applicationStart,
    applicationDeadline: tournament.applicationDeadline,
  });

  if (applicationState === "closed" || applicationState === "coming-soon") {
    return (
      <ApplyShell>
        <Container className="py-16 sm:py-20">
          <h1 className="font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
            Bewerbung nicht möglich
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            {settings.applicationsEnabled
              ? `Für ${tournament.name} können derzeit keine Bewerbungen gesendet werden.`
              : "Bewerbungen sind derzeit global deaktiviert."}
          </p>
          <Link
            href={`/turniere/${tournament.slug}`}
            className="mt-8 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Zum Turnier →
          </Link>
        </Container>
      </ApplyShell>
    );
  }

  return (
    <ApplyShell>
      <Container className="py-10 sm:py-12 lg:py-14">
        <Link
          href={`/turniere/${tournament.slug}`}
          className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          ← Zum Turnier
        </Link>

        <div className="mt-6 max-w-[1100px]">
          <p className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            {tournament.name}
          </p>
          <p className="mt-2 text-[15px] text-muted">
            {formatDateDe(tournament.date)} · {tournament.location}
          </p>
          <div className="mt-3">
            <StatusBadge status={tournament.status} />
          </div>
          <h1 className="mt-8 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-[1.75rem]">
            Mannschaft bewerben
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">
            Bewirb deine Mannschaft für unser Turnier. Nach Eingang prüfen wir
            eure Bewerbung und melden uns anschließend bei euch.
          </p>
        </div>

        <div className="mt-8 grid max-w-[1100px] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="order-2 max-w-[1000px] lg:order-1">
            <ApplicationForm
              tournamentId={tournament.id}
              tournamentSlug={tournament.slug}
              ageGroup={tournament.ageGroup}
              prefill={prefill}
              teams={workspace?.teams}
            />
          </div>
          <div className="order-1 lg:order-2">
            <TournamentSummary tournament={tournament} />
          </div>
        </div>
      </Container>
    </ApplyShell>
  );
}

function ApplyShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function TournamentSummary({ tournament }: { tournament: PublicTournament }) {
  return (
    <aside className="border border-line bg-white p-5 lg:sticky lg:top-8">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        Turnier
      </p>
      <p className="mt-3 font-display text-lg font-bold tracking-wide text-ink uppercase">
        {tournament.name}
      </p>
      <dl className="mt-4 space-y-3 text-[13px] text-muted">
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Datum
          </dt>
          <dd className="mt-1">{formatDateDe(tournament.date)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Ort
          </dt>
          <dd className="mt-1">{tournament.location}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Altersklasse
          </dt>
          <dd className="mt-1">{tournament.ageGroup}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Status
          </dt>
          <dd className="mt-2">
            <StatusBadge status={tournament.status} />
          </dd>
        </div>
      </dl>
    </aside>
  );
}
