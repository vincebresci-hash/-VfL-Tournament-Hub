import { HomeHero } from "@/components/home/HomeHero";
import { HomeMatchTeaser } from "@/components/home/HomeMatchTeaser";
import { HomeUpcomingSection } from "@/components/home/HomeUpcomingSection";
import { HomeRecentSection } from "@/components/home/HomeRecentSection";
import { HomeClubsTeaser } from "@/components/home/HomeClubsTeaser";
import { HomeHowItWorks } from "@/components/home/HomeHowItWorks";
import { PartnersSection } from "@/components/home/PartnersSection";
import { Container } from "@/components/layout/Container";
import { Footer } from "@/components/layout/Footer";
import type { LivePageData } from "@/lib/db/live-queries";
import { resolveHomepageHeroMoment, formatHomepageCapacityLabel } from "@/lib/home/homepage-moment";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import type { TournamentMatchRecord } from "@/types/schedule";

type HomePageViewProps = {
  data: LivePageData;
  applicationsEnabled: boolean;
  waitlistEnabled: boolean;
};

function fieldLabel(
  match: TournamentMatchRecord,
  fieldNameById: Map<string, string>,
) {
  if (!match.fieldId) {
    return null;
  }
  return fieldNameById.get(match.fieldId) ?? "Feld";
}

function groupOrRoundLabel(
  match: TournamentMatchRecord,
  groupNameById: Map<string, string>,
) {
  if (match.groupId) {
    return groupNameById.get(match.groupId) ?? "Gruppe";
  }
  if (match.round) {
    return knockoutRoundLabel[match.round] ?? "KO";
  }
  return null;
}

export function HomePageView({
  data,
  applicationsEnabled,
  waitlistEnabled,
}: HomePageViewProps) {
  const matches = data.stage?.matches ?? [];
  const moment = resolveHomepageHeroMoment({
    selection: data.selection,
    primary: data.primary,
    upcoming: data.upcoming,
    past: data.past,
    matches,
    upcomingLimit: 3,
  });

  const groupNameById = new Map(
    (data.stage?.groups ?? []).map((group) => [group.id, group.name]),
  );
  const fieldNameById = new Map(
    (data.stage?.fields ?? []).map((field) => [field.id, field.name]),
  );

  const fieldCount = data.stage?.fields.length ?? 0;
  const matchCount = matches.filter((match) => match.status !== "cancelled").length;
  const capacityLabel = moment.tournament
    ? formatHomepageCapacityLabel(moment.tournament)
    : null;

  const teaser =
    moment.kind === "live" && moment.matchMoment ? (
      <HomeMatchTeaser
        moment={moment.matchMoment}
        teamMap={data.teamMap}
        fieldLabel={
          moment.matchMoment.match
            ? fieldLabel(moment.matchMoment.match, fieldNameById)
            : null
        }
        groupOrRoundLabel={
          moment.matchMoment.match
            ? groupOrRoundLabel(moment.matchMoment.match, groupNameById)
            : null
        }
      />
    ) : null;

  const upcomingFiltered =
    moment.kind === "next" && moment.tournament
      ? moment.upcoming.filter((entry) => entry.id !== moment.tournament!.id).slice(0, 3)
      : moment.upcoming;

  const upcomingForSection =
    upcomingFiltered.length > 0 ? upcomingFiltered : moment.upcoming.slice(0, 3);

  return (
    <div className="flex min-h-full flex-col">
      <HomeHero
        kind={moment.kind}
        tournament={moment.tournament}
        capacityLabel={capacityLabel}
        fieldCount={fieldCount}
        matchCount={matchCount}
        applicationsEnabled={applicationsEnabled}
        waitlistEnabled={waitlistEnabled}
        matchTeaser={teaser}
      />

      <main id="inhalt">
        <HomeUpcomingSection
          tournaments={upcomingForSection}
          applicationsEnabled={applicationsEnabled}
          waitlistEnabled={waitlistEnabled}
        />
        <HomeRecentSection tournament={moment.recentTournament} />
        <HomeClubsTeaser />
        <HomeHowItWorks />
        <section className="bg-navy py-10 sm:py-12" aria-label="Partner">
          <Container>
            <PartnersSection />
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}
