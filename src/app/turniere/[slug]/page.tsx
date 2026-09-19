import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { TournamentPublicStage } from "@/components/tournaments/TournamentPublicStage";
import { TournamentPartnersSection } from "@/components/tournaments/TournamentPartnersSection";
import { TournamentHero } from "@/components/tournaments/TournamentHero";
import { TournamentInfoGrid } from "@/components/tournaments/TournamentInfoGrid";
import { TournamentDescription } from "@/components/tournaments/TournamentDescription";
import { TournamentExtraInfo } from "@/components/tournaments/TournamentExtraInfo";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { formatDateDe, formatDateTimeDe, formatTimeDe } from "@/lib/format";
import { getPublicTournamentStage } from "@/lib/db/schedule-queries";
import { getPublicTournamentBySlug } from "@/lib/db/tournament-queries";
import {
  getPublicApplicationState,
  getPublicApplicationStatusDisplay,
} from "@/lib/public-application-state";
import { filledPublicInfo, getDisplayCapacity } from "@/lib/public-tournament";
import { getAppSettings } from "@/lib/settings";
import { nonempty } from "@/lib/text";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import {
  isHybridLiveDataSource,
  isMeinTurnierplanPublic,
  showsMeinTurnierplanLiveTab,
  usesMeinTurnierplanAsPrimaryLive,
} from "@/lib/mein-turnierplan";
import { getPublicMeinTurnierplanData } from "@/lib/mein-turnierplan-public-data";
import { listPublicActivePartnersForTournament } from "@/lib/partners/queries";
import { publicTeamLabel } from "@/lib/schedule/names";
import { getSiteUrl, withCanonical } from "@/lib/site";

type TournamentDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[]; live?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: TournamentDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getPublicTournamentBySlug(slug);

  const title = tournament?.name ?? "Turnier";
  const description =
    nonempty(tournament?.shortDescription) ?? nonempty(tournament?.description) ?? undefined;
  const pageUrl = `${getSiteUrl()}/turniere/${slug}`;

  return withCanonical(`/turniere/${slug}`, {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: pageUrl,
    },
  });
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

  const [settings, stage, meinTurnierplanPublic, tournamentPartners] =
    await Promise.all([
      getAppSettings(),
      getPublicTournamentStage(tournament.slug, tournament.id),
      getPublicMeinTurnierplanData(tournament),
      listPublicActivePartnersForTournament(tournament.id),
    ]);
  const applicationGate = {
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
  };
  const applicationState = getPublicApplicationState(applicationGate);
  const applicationStatusDisplay = getPublicApplicationStatusDisplay(applicationGate);
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
  const showLiveTab = showsMeinTurnierplanLiveTab(tournament);
  const meinTurnierplanPrimary = usesMeinTurnierplanAsPrimaryLive(tournament);
  const meinTurnierplanHybrid = isHybridLiveDataSource(tournament);
  const showTopMeinTurnierplanButton =
    showMeinTurnierplan && !showLiveTab;
  // Hero availability: presentation-only when capacity exists and apply path is active.
  const showHeroAvailability =
    capacity != null &&
    (applicationState === "open" || applicationState === "waitlist");
  const facts = [
    { label: "Datum", value: formatDateDe(tournament.date) },
    startTime ? { label: "Startzeit", value: startTime } : null,
    endTime ? { label: "Geplantes Ende", value: endTime } : null,
    nonempty(tournament.location)
      ? { label: "Veranstaltungsort", value: tournament.location }
      : null,
    nonempty(tournament.address) ? { label: "Adresse", value: tournament.address } : null,
    tournament.ageGroup ? { label: "Altersklasse", value: tournament.ageGroup } : null,
    tournament.birthYear ? { label: "Jahrgang", value: String(tournament.birthYear) } : null,
    capacity ? { label: "Max. Teams", value: String(capacity.maxTeams) } : null,
    tournament.confirmedTeams > 0 || capacity
      ? { label: "Bestätigte Teams", value: String(tournament.confirmedTeams) }
      : null,
    capacity ? { label: "Freie Plätze", value: String(capacity.availableSlots) } : null,
    tournament.applicationStart
      ? { label: "Bewerbungsstart", value: formatDateTimeDe(tournament.applicationStart) }
      : null,
    tournament.applicationDeadline
      ? { label: "Bewerbungsfrist", value: formatDateTimeDe(tournament.applicationDeadline) }
      : null,
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
        <Container className="py-8 sm:py-12 lg:py-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/turniere"
              className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
            >
              ← Alle Turniere
            </Link>
            <nav
              aria-label="Brotkrumen"
              className="hidden text-[12px] tracking-[0.02em] text-muted sm:block"
            >
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link
                    href="/"
                    className="transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    Startseite
                  </Link>
                </li>
                <li aria-hidden="true">›</li>
                <li>
                  <Link
                    href="/turniere"
                    className="transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    Turniere
                  </Link>
                </li>
                <li aria-hidden="true">›</li>
                <li className="max-w-[14rem] truncate font-medium text-ink">
                  {tournament.name}
                </li>
              </ol>
            </nav>
          </div>

          <TournamentHero
            name={tournament.name}
            slug={tournament.slug}
            image={tournament.image}
            ageGroup={tournament.ageGroup}
            dateIso={tournament.date}
            dateLabel={formatDateDe(tournament.date)}
            startTimeLabel={startTime}
            location={nonempty(tournament.location)}
            address={nonempty(tournament.address)}
            shortDescription={shortDescription}
            applicationState={applicationState}
            applicationStatusDisplay={applicationStatusDisplay}
            canApply={canApply}
            ctaLabel={ctaLabel}
            availableSlots={capacity?.availableSlots ?? null}
            showAvailability={showHeroAvailability}
          />

          {showTopMeinTurnierplanButton ? (
            <MeinTurnierplanPublicButton
              tournamentName={tournament.name}
              tournamentDate={tournament.date}
              tournamentStatus={tournament.status}
              url={tournament.meinTurnierplanUrl}
              customLabel={tournament.meinTurnierplanLabel}
            />
          ) : null}

          <TournamentPartnersSection partners={tournamentPartners} />

          <TournamentInfoGrid facts={facts} />

          {longDescription && longDescription !== shortDescription ? (
            <TournamentDescription description={longDescription} />
          ) : null}

          <TournamentExtraInfo items={extraInfo} />

          <TournamentPublicStage
            slug={tournament.slug}
            stage={stage}
            tab={tab}
            tournamentStatus={tournament.status}
            meinTurnierplanActive={showMeinTurnierplan}
            showLiveTab={showLiveTab}
            meinTurnierplanPrimary={meinTurnierplanPrimary}
            meinTurnierplanHybrid={meinTurnierplanHybrid}
            publicScheduleNote={tournament.publicScheduleNote}
            meinTurnierplanPublic={meinTurnierplanPublic}
            preferSyncedHubData={Boolean(
              tournament.meinTurnierplanLastSyncedAt &&
                (stage.matches.length > 0 ||
                  stage.groups.length > 0 ||
                  stage.roster.length > 0),
            )}
            livePresentation={
              showLiveTab
                ? {
                    tournamentName: tournament.name,
                    tournamentDate: tournament.date,
                    tournamentStatus: tournament.status,
                    presentationUrl: tournament.meinTurnierplanUrl,
                    customLabel: tournament.meinTurnierplanLabel,
                    matchesWidgetUrl: tournament.meinTurnierplanMatchesWidgetUrl,
                    tableWidgetUrl: tournament.meinTurnierplanTableWidgetUrl,
                    publicLiveNote: tournament.publicLiveNote,
                    meinTurnierplanEmbedUrl: tournament.meinTurnierplanEmbedUrl,
                  }
                : null
            }
            overview={
              stage.roster.length > 0 ? (
            <section>
              <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
                Teilnehmende Teams
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {stage.roster.map((entry) => (
                  <li
                    key={entry.applicationId}
                    className="flex items-center gap-3 border border-line bg-white px-4 py-3 text-[15px] text-ink"
                  >
                    <ParticipantClubLogo logoUrl={entry.logoUrl} clubName={entry.clubName} />
                    <span>{publicTeamLabel(entry.clubName, entry.teamName)}</span>
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
