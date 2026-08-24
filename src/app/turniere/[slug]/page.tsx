import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/brand/CoverImage";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { TournamentPublicStage } from "@/components/tournaments/TournamentPublicStage";
import { formatDateDe, formatDateTimeDe, formatTimeDe } from "@/lib/format";
import { getPublicTournamentStage } from "@/lib/db/schedule-queries";
import { getPublicTournamentBySlug } from "@/lib/db/tournament-queries";
import {
  getPublicApplicationState,
  publicApplicationStateLabel,
} from "@/lib/public-application-state";
import { filledPublicInfo, getDisplayCapacity } from "@/lib/public-tournament";
import { getAppSettings } from "@/lib/settings";
import { nonempty } from "@/lib/text";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import { isMeinTurnierplanPublic } from "@/lib/mein-turnierplan";
import { tournamentStatusClassName } from "@/lib/tournament-status";

type TournamentDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: TournamentDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getPublicTournamentBySlug(slug);

  return {
    title: tournament?.name ?? "Turnier",
    description: nonempty(tournament?.shortDescription) ?? nonempty(tournament?.description) ?? undefined,
  };
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: TournamentDetailPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tournament = await getPublicTournamentBySlug(slug);

  if (!tournament) {
    notFound();
  }

  const [settings, stage] = await Promise.all([
    getAppSettings(),
    getPublicTournamentStage(tournament.slug, tournament.id),
  ]);
  const applicationState = getPublicApplicationState({
    status: tournament.status,
    applicationsEnabled: settings.applicationsEnabled,
    applicationsOpen: tournament.applicationsOpen,
    archivedAt: tournament.archivedAt,
    availableSlots: tournament.availableSlots,
    waitlistEnabled: settings.waitlistEnabled && tournament.waitlistEnabled,
    isFull: tournament.isFull,
    applicationStart: tournament.applicationStart,
    applicationDeadline: tournament.applicationDeadline,
    maxTeams: tournament.maxTeams,
  });
  const canApply = applicationState === "open" || applicationState === "waitlist";
  const ctaLabel =
    applicationState === "waitlist"
      ? "Für Warteliste bewerben →"
      : "Jetzt bewerben →";
  const startTime = formatTimeDe(tournament.startTime);
  const endTime = formatTimeDe(tournament.endTime);
  const shortDescription = nonempty(tournament.shortDescription);
  const longDescription = nonempty(tournament.description);
  const capacity = getDisplayCapacity(tournament);
  const extraInfo = filledPublicInfo(tournament);
  const showMeinTurnierplan = isMeinTurnierplanPublic(tournament);
  const facts = [
    tournament.ageGroup ? { label: "Altersklasse", value: tournament.ageGroup } : null,
    tournament.birthYear ? { label: "Jahrgang", value: String(tournament.birthYear) } : null,
    { label: "Datum", value: formatDateDe(tournament.date) },
    startTime ? { label: "Startzeit", value: startTime } : null,
    endTime ? { label: "Geplantes Ende", value: endTime } : null,
    nonempty(tournament.location)
      ? { label: "Veranstaltungsort", value: tournament.location }
      : null,
    nonempty(tournament.address) ? { label: "Adresse", value: tournament.address } : null,
    tournament.applicationStart
      ? { label: "Bewerbungsstart", value: formatDateTimeDe(tournament.applicationStart) }
      : null,
    tournament.applicationDeadline
      ? { label: "Bewerbungsfrist", value: formatDateTimeDe(tournament.applicationDeadline) }
      : null,
    capacity ? { label: "Max. Teams", value: String(capacity.maxTeams) } : null,
    tournament.confirmedTeams > 0 || capacity
      ? { label: "Bestätigte Teams", value: String(tournament.confirmedTeams) }
      : null,
    capacity ? { label: "Freie Plätze", value: String(capacity.availableSlots) } : null,
    tournament.waitlistEnabled || applicationState === "waitlist"
      ? {
          label: "Warteliste",
          value:
            applicationState === "waitlist"
              ? "Aktiv – Bewerbung für die Warteliste möglich"
              : tournament.waitlistEnabled
                ? "Wird angeboten, wenn das Feld voll ist"
                : null,
        }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item?.value));

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
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
                {startTime ? ` · ${startTime}` : ""}
              </p>
              {nonempty(tournament.location) ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] text-muted">
                  <IconPin className="h-4 w-4 text-brand-yellow" />
                  {tournament.location}
                  {nonempty(tournament.address) ? ` · ${tournament.address}` : ""}
                </p>
              ) : null}

              {shortDescription ? (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
                  {shortDescription}
                </p>
              ) : null}

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

          {showMeinTurnierplan ? (
            <MeinTurnierplanPublicButton
              tournamentName={tournament.name}
              tournamentDate={tournament.date}
              tournamentStatus={tournament.status}
              url={tournament.meinTurnierplanUrl}
              customLabel={tournament.meinTurnierplanLabel}
            />
          ) : null}

          {facts.length > 0 ? (
            <dl className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className="border border-line bg-white px-4 py-3">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-[15px] text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {longDescription && longDescription !== shortDescription ? (
            <section className="mt-10 max-w-3xl">
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Beschreibung
              </h2>
              <p className="mt-4 whitespace-pre-line text-base leading-7 text-muted">
                {longDescription}
              </p>
            </section>
          ) : null}

          {extraInfo.length > 0 ? (
            <section className="mt-10 grid gap-4 md:grid-cols-2">
              {extraInfo.map((item) => (
                <article key={item.key} className="border border-line bg-white p-5">
                  <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {item.label}
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-muted">
                    {item.value}
                  </p>
                </article>
              ))}
            </section>
          ) : null}

          <TournamentPublicStage
            slug={tournament.slug}
            stage={stage}
            tab={tab}
            tournamentStatus={tournament.status}
            meinTurnierplanActive={showMeinTurnierplan}
            overview={
              stage.roster.length > 0 ? (
            <section>
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Teilnehmende Teams
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {stage.roster.map((entry) => (
                  <li key={entry.applicationId} className="border border-line bg-white px-4 py-3 text-[15px] text-ink">
                    {entry.clubName}
                    {entry.teamName ? ` · ${entry.teamName}` : ""}
                  </li>
                ))}
              </ul>
            </section>
              ) : null
            }
          />
        </Container>
      </main>
      <Footer />
    </div>
  );
}
