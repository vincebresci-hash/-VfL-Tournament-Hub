import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/brand/CoverImage";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Container } from "@/components/layout/Container";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { formatDateDe } from "@/lib/format";
import { getTournamentOccupancy } from "@/lib/db/queries";
import {
  getPublicApplicationState,
  publicApplicationStateLabel,
} from "@/lib/public-application-state";
import { getAppSettings } from "@/lib/settings";
import { tournamentStatusClassName } from "@/lib/tournament-status";
import {
  getPublicTournamentBySlug,
  getPublicTournaments,
} from "@/lib/tournaments";

type TournamentDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getPublicTournaments().map((tournament) => ({
    slug: tournament.slug,
  }));
}

export async function generateMetadata({
  params,
}: TournamentDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = getPublicTournamentBySlug(slug);

  return {
    title: tournament?.name ?? "Turnier",
  };
}

export default async function TournamentDetailPage({
  params,
}: TournamentDetailPageProps) {
  const { slug } = await params;
  const tournament = getPublicTournamentBySlug(slug);

  if (!tournament) {
    notFound();
  }

  const [settings, occupancy] = await Promise.all([
    getAppSettings(),
    getTournamentOccupancy(tournament.slug),
  ]);
  const availableSlots = occupancy?.availableSlots ?? tournament.maxTeams;
  const isFull = occupancy?.isFull ?? false;
  const applicationState = getPublicApplicationState({
    status: tournament.status,
    applicationsEnabled: settings.applicationsEnabled,
    availableSlots,
    waitlistEnabled: settings.waitlistEnabled,
    isFull,
  });
  const canApply = applicationState === "open" || applicationState === "waitlist";
  const ctaLabel =
    applicationState === "waitlist"
      ? "Für Warteliste bewerben →"
      : "Jetzt bewerben →";

  return (
    <div className="flex min-h-full flex-col">
      <Header variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          <Link
            href="/turniere"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            ← Alle Turniere
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
            <CoverImage
              src={tournament.image}
              alt={tournament.name}
              className="aspect-[16/9] w-full rounded-[12px]"
              sizes="(min-width: 1024px) 55vw, 100vw"
              objectPosition="50% 42%"
            />

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex bg-brand-yellow px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
                  {tournament.ageGroup}
                </span>
                <StatusBadge status={tournament.status} />
                <span
                  className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
                    applicationState === "open"
                      ? tournamentStatusClassName.active
                      : applicationState === "waitlist"
                        ? tournamentStatusClassName.full
                        : applicationState === "coming-soon"
                          ? tournamentStatusClassName["coming-soon"]
                          : tournamentStatusClassName.completed
                  }`}
                >
                  {publicApplicationStateLabel[applicationState]}
                </span>
              </div>

              <h1 className="mt-4 font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
                {tournament.name}
              </h1>

              <p className="mt-4 inline-flex items-center gap-1.5 text-[15px] text-muted">
                <IconCalendar className="h-4 w-4 text-brand-yellow" />
                <time dateTime={tournament.date}>{formatDateDe(tournament.date)}</time>
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] text-muted">
                <IconPin className="h-4 w-4 text-brand-yellow" />
                {tournament.location}
              </p>
              <p className="mt-3 text-[11px] font-medium tracking-[0.08em] text-ink uppercase">
                {tournament.maxTeams} Teams
              </p>
              {applicationState === "waitlist" ? (
                <p className="mt-3 text-[13px] font-semibold tracking-[0.08em] text-ink uppercase">
                  Bewerbung für Warteliste möglich
                </p>
              ) : null}

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
                {tournament.description}
              </p>

              <div className="mt-8">
                {applicationState === "coming-soon" ? (
                  <span className="inline-flex h-11 items-center px-4 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                    Demnächst bewerben
                  </span>
                ) : canApply ? (
                  <Link
                    href={`/turniere/${tournament.slug}/bewerben`}
                    className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    {ctaLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
