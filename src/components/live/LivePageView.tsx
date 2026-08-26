import Link from "next/link";
import type { ReactNode } from "react";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { MeinTurnierplanBadge } from "@/components/tournaments/MeinTurnierplanPublicButton";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { LiveMatchCard } from "@/components/live/LiveMatchCard";
import { LiveShareActions } from "@/components/live/LiveShareActions";
import {
  resolveLiveTeam,
  type LivePageData,
  type LiveTeamRef,
} from "@/lib/db/live-queries";
import {
  formatUpdatedAgo,
  LIVE_TYPO,
  mapsSearchUrl,
  nextMatchForParticipant,
  selectNextMatches,
  selectOtherLiveMatches,
  selectPrimaryMatchMoment,
  selectRecentResults,
} from "@/lib/live/match-center";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import { formatDateDe, formatTimeDe } from "@/lib/format";
import { getSiteUrl } from "@/lib/site";
import {
  getEffectiveTournamentStatus,
  tournamentStatusClassName,
  tournamentStatusLabel,
} from "@/lib/tournament-status";
import { nonempty } from "@/lib/text";
import { cn } from "@/lib/cn";
import type { PublicTournament } from "@/types/tournament";
import type { TournamentMatchRecord } from "@/types/schedule";

type LivePageViewProps = {
  data: LivePageData;
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

function SideTournamentCard({
  tournament,
  href,
}: {
  tournament: PublicTournament;
  href: string;
}) {
  const effectiveStatus = getEffectiveTournamentStatus({
    dbStatus: tournament.status,
    maxTeams: tournament.maxTeams,
    confirmedParticipants: tournament.confirmedTeams,
    archivedAt: tournament.archivedAt,
  });

  return (
    <Link
      href={href}
      className="block bg-white p-4 ring-1 ring-line transition-colors hover:ring-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex bg-brand-yellow px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
          {tournament.ageGroup}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase",
            tournamentStatusClassName[effectiveStatus],
          )}
        >
          {tournamentStatusLabel[effectiveStatus]}
        </span>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted">
        <IconCalendar className="h-3.5 w-3.5 text-brand-yellow" />
        <time dateTime={tournament.date}>{formatDateDe(tournament.date)}</time>
      </p>
      <h3 className="mt-2 font-display text-base font-bold tracking-wide text-ink uppercase">
        {tournament.name}
      </h3>
      {tournament.location ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <IconPin className="h-3.5 w-3.5 text-brand-yellow" />
          {tournament.location}
        </p>
      ) : null}
    </Link>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className={LIVE_TYPO.section}>{children}</h2>;
}

function emptyMatchesCopy(primary: PublicTournament, hasCompleted: boolean) {
  if (hasCompleted) {
    return "Aktuell läuft kein Spiel. Die letzten Ergebnisse findest du weiter unten.";
  }
  const start = formatTimeDe(primary.startTime);
  if (start) {
    return `Der Spielplan startet um ${start} Uhr.`;
  }
  return "Noch keine Ergebnisse – sie erscheinen hier während des Turniers.";
}

function ParticipantCard({
  team,
  groupName,
  nextHint,
}: {
  team: LiveTeamRef;
  groupName: string | null;
  nextHint: string | null;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 bg-white px-3 py-3 ring-1 ring-line">
      <ParticipantClubLogo logoUrl={team.logoUrl} clubName={team.clubName} size="md" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">{team.label}</p>
        {groupName ? <p className={cn(LIVE_TYPO.meta, "mt-0.5")}>{groupName}</p> : null}
        {nextHint ? <p className={cn(LIVE_TYPO.meta, "mt-1 text-ink/70")}>{nextHint}</p> : null}
      </div>
    </li>
  );
}

export function LivePageView({ data }: LivePageViewProps) {
  const {
    primary,
    todayAlso,
    upcoming,
    past,
    stage,
    teamMap,
    groups,
    participants,
    capacity,
    meinTurnierplanActive,
    showLiveSpielplanCta,
  } = data;

  const groupNameById = new Map((stage?.groups ?? []).map((group) => [group.id, group.name]));
  const fieldNameById = new Map((stage?.fields ?? []).map((field) => [field.id, field.name]));
  const matches = stage?.matches ?? [];
  const primaryMoment = selectPrimaryMatchMoment(matches);
  const primaryMatchId = primaryMoment.match?.id ?? null;
  const otherLive = selectOtherLiveMatches(matches, primaryMatchId);
  const nextMatches = selectNextMatches(matches, primaryMatchId, 5);
  const recentResults = selectRecentResults(matches, 5);
  const updatedLabel = formatUpdatedAgo(primary?.meinTurnierplanLastSyncedAt);
  const routeUrl = primary ? mapsSearchUrl(primary.location, primary.address) : null;
  const liveUrl = `${getSiteUrl()}/live`;
  const fieldCount = stage?.fields.length ?? 0;
  const matchCount = matches.filter((match) => match.status !== "cancelled").length;

  const primaryEffectiveStatus = primary
    ? getEffectiveTournamentStatus({
        dbStatus: primary.status,
        maxTeams: primary.maxTeams,
        confirmedParticipants: primary.confirmedTeams,
        archivedAt: primary.archivedAt,
      })
    : null;

  const groupNameByParticipantId = new Map<string, string>();
  for (const entry of stage?.roster ?? []) {
    const id = entry.externalTeamId ?? entry.applicationId;
    if (entry.groupName) {
      groupNameByParticipantId.set(id, entry.groupName);
    } else if (entry.groupId) {
      groupNameByParticipantId.set(id, groupNameById.get(entry.groupId) ?? "Gruppe");
    }
  }

  return (
    <div className="bg-surface">
      {/* Compact tournament context – not competing with primary match */}
      {primary ? (
        <section className="border-b border-line bg-navy text-white">
          <Container className="py-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(LIVE_TYPO.badge, "bg-brand-yellow text-navy")}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-red" aria-hidden />
                LIVE
              </span>
              {meinTurnierplanActive && primaryEffectiveStatus ? (
                <MeinTurnierplanBadge
                  date={primary.date}
                  status={primaryEffectiveStatus}
                  meinTurnierplanEnabled={primary.meinTurnierplanEnabled}
                  meinTurnierplanUrl={primary.meinTurnierplanUrl}
                />
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 max-w-3xl">
                <h1 className={LIVE_TYPO.title}>{primary.name}</h1>
                <p className="mt-3 text-[14px] text-white/75 sm:text-[15px]">
                  {[
                    primary.ageGroup,
                    primary.birthYear ? `Jahrgang ${primary.birthYear}` : null,
                    formatDateDe(primary.date),
                    primary.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/80 sm:text-[14px]">
                  {capacity ? (
                    <span>
                      {capacity.confirmedTeams}
                      {capacity.maxTeams != null ? ` / ${capacity.maxTeams}` : ""} Teams
                    </span>
                  ) : primary.confirmedTeams > 0 ? (
                    <span>{primary.confirmedTeams} Teams</span>
                  ) : null}
                  {fieldCount > 0 ? <span>{fieldCount} Felder</span> : null}
                  {matchCount > 0 ? <span>{matchCount} Spiele</span> : null}
                  {formatTimeDe(primary.endTime) ? (
                    <span>Ende {formatTimeDe(primary.endTime)}</span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/60">
                  {updatedLabel ? <span>{updatedLabel}</span> : null}
                  {meinTurnierplanActive ? <span>Live-Daten via MeinTurnierplan</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/turniere/${primary.slug}`}
                  className="inline-flex h-11 items-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Zum Turnier →
                </Link>
                {showLiveSpielplanCta && primary.meinTurnierplanUrl ? (
                  <a
                    href={primary.meinTurnierplanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center border border-white/35 px-5 text-[12px] font-semibold tracking-[0.08em] text-white uppercase hover:border-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    Externer Spielplan
                  </a>
                ) : null}
              </div>
            </div>
          </Container>
        </section>
      ) : (
        <section className="bg-navy text-white">
          <Container className="py-14 sm:py-20">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-yellow uppercase">
              Live
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-wide uppercase sm:text-5xl">
              Aktuell findet kein Turnier statt.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-white/70">
              Hier erscheinen am Turniertag automatisch Spielplan, Ergebnisse und Tabellen.
            </p>
          </Container>
        </section>
      )}

      <Container className="py-8 sm:py-10 lg:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-12">
          <div className="grid gap-10">
            {todayAlso.length > 0 ? (
              <section>
                <SectionHeading>Heute außerdem</SectionHeading>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {todayAlso.map((tournament) => (
                    <SideTournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      href={`/turniere/${tournament.slug}`}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {primary ? (
              <>
                {/* PRIMARY MOMENT */}
                <section aria-label="Hauptspiel">
                  {primaryMoment.match ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <SectionHeading>
                          {primaryMoment.kind === "live" ? "Läuft gerade" : "Als Nächstes"}
                        </SectionHeading>
                      </div>
                      <LiveMatchCard
                        match={primaryMoment.match}
                        home={resolveLiveTeam(
                          teamMap,
                          primaryMoment.match.homeApplicationId,
                          primaryMoment.match.homeExternalTeamId ?? null,
                        )}
                        away={resolveLiveTeam(
                          teamMap,
                          primaryMoment.match.awayApplicationId,
                          primaryMoment.match.awayExternalTeamId ?? null,
                        )}
                        variant={primaryMoment.kind === "live" ? "live" : "next"}
                        fieldLabel={fieldLabel(primaryMoment.match, fieldNameById)}
                        groupOrRoundLabel={groupOrRoundLabel(
                          primaryMoment.match,
                          groupNameById,
                        )}
                        featured
                      />
                    </>
                  ) : (
                    <div className="bg-white p-6 ring-1 ring-line sm:p-8">
                      <SectionHeading>
                        {recentResults.length > 0 ? "Turniertag" : "Spielplan"}
                      </SectionHeading>
                      <p className={cn(LIVE_TYPO.body, "mt-3 text-muted")}>
                        {emptyMatchesCopy(primary, recentResults.length > 0)}
                      </p>
                    </div>
                  )}
                </section>

                {otherLive.length > 0 ? (
                  <section>
                    <SectionHeading>Läuft jetzt</SectionHeading>
                    <div className="mt-4 grid gap-3">
                      {otherLive.map((match) => (
                        <LiveMatchCard
                          key={match.id}
                          match={match}
                          home={resolveLiveTeam(
                            teamMap,
                            match.homeApplicationId,
                            match.homeExternalTeamId ?? null,
                          )}
                          away={resolveLiveTeam(
                            teamMap,
                            match.awayApplicationId,
                            match.awayExternalTeamId ?? null,
                          )}
                          variant="live"
                          fieldLabel={fieldLabel(match, fieldNameById)}
                          groupOrRoundLabel={groupOrRoundLabel(match, groupNameById)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {nextMatches.length > 0 ? (
                  <section>
                    <SectionHeading>Als Nächstes</SectionHeading>
                    <div className="mt-4 grid gap-3">
                      {nextMatches.map((match) => (
                        <LiveMatchCard
                          key={match.id}
                          match={match}
                          home={resolveLiveTeam(
                            teamMap,
                            match.homeApplicationId,
                            match.homeExternalTeamId ?? null,
                          )}
                          away={resolveLiveTeam(
                            teamMap,
                            match.awayApplicationId,
                            match.awayExternalTeamId ?? null,
                          )}
                          variant="next"
                          fieldLabel={fieldLabel(match, fieldNameById)}
                          groupOrRoundLabel={groupOrRoundLabel(match, groupNameById)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {recentResults.length > 0 ? (
                  <section>
                    <SectionHeading>Letzte Ergebnisse</SectionHeading>
                    <div className="mt-4 grid gap-3">
                      {recentResults.map((match) => (
                        <LiveMatchCard
                          key={match.id}
                          match={match}
                          home={resolveLiveTeam(
                            teamMap,
                            match.homeApplicationId,
                            match.homeExternalTeamId ?? null,
                          )}
                          away={resolveLiveTeam(
                            teamMap,
                            match.awayApplicationId,
                            match.awayExternalTeamId ?? null,
                          )}
                          variant="completed"
                          fieldLabel={fieldLabel(match, fieldNameById)}
                          groupOrRoundLabel={groupOrRoundLabel(match, groupNameById)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {groups.length > 0 ? (
                  <section>
                    <SectionHeading>Gruppen &amp; Tabellen</SectionHeading>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {groups.map((group) => (
                        <article key={group.id} className="bg-white p-4 ring-1 ring-line sm:p-5">
                          <h3 className="font-display text-base font-bold tracking-wide text-ink uppercase sm:text-lg">
                            {group.name}
                          </h3>
                          {group.standings.length > 0 ? (
                            <table className="mt-4 w-full text-left text-[13px] sm:text-[14px]">
                              <thead>
                                <tr className="text-[11px] tracking-[0.08em] text-muted uppercase">
                                  <th className="pb-2 pr-2 font-semibold">Pl</th>
                                  <th className="pb-2 pr-2 font-semibold">Team</th>
                                  <th className="hidden pb-2 pr-2 font-semibold sm:table-cell">
                                    Sp
                                  </th>
                                  <th className="hidden pb-2 pr-2 font-semibold md:table-cell">
                                    TD
                                  </th>
                                  <th className="pb-2 font-semibold">Pkt</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.standings.map((row) => (
                                  <tr
                                    key={`${group.id}-${row.team.id}`}
                                    className={cn(
                                      "border-t border-line",
                                      row.rank === 1 && "bg-brand-yellow/15",
                                      row.rank <= 3 && row.rank > 1 && "bg-surface/80",
                                    )}
                                  >
                                    <td className="py-2.5 pr-2 tabular-nums font-semibold text-ink">
                                      {row.rank}
                                    </td>
                                    <td className="py-2.5 pr-2">
                                      <span className="inline-flex min-w-0 items-center gap-2">
                                        <ParticipantClubLogo
                                          logoUrl={row.team.logoUrl}
                                          clubName={row.team.clubName}
                                          size="sm"
                                        />
                                        <span className="line-clamp-1 font-medium text-ink">
                                          {row.team.label}
                                        </span>
                                      </span>
                                    </td>
                                    <td className="hidden py-2.5 pr-2 tabular-nums text-ink sm:table-cell">
                                      {row.played}
                                    </td>
                                    <td className="hidden py-2.5 pr-2 tabular-nums text-ink md:table-cell">
                                      {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                                    </td>
                                    <td className="py-2.5 tabular-nums font-semibold text-ink">
                                      {row.points}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <ul className="mt-3 grid gap-2">
                              {group.teams.map((team) => (
                                <li
                                  key={team.id}
                                  className="flex items-center gap-2 text-[14px] text-ink"
                                >
                                  <ParticipantClubLogo
                                    logoUrl={team.logoUrl}
                                    clubName={team.clubName}
                                    size="sm"
                                  />
                                  <span className="line-clamp-1">{team.label}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {participants.length > 0 ? (
                  <section>
                    <SectionHeading>Teilnehmer</SectionHeading>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {participants.map((team) => {
                        const next = nextMatchForParticipant(matches, team.id);
                        const nextHint = next
                          ? [
                              "Nächstes Spiel",
                              formatBerlinClock(next.scheduledAt),
                              fieldLabel(next, fieldNameById),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : null;
                        return (
                          <ParticipantCard
                            key={team.id}
                            team={team}
                            groupName={groupNameByParticipantId.get(team.id) ?? null}
                            nextHint={nextHint}
                          />
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                {/* Venue – after matches/tables on mobile */}
                <section className="lg:hidden">
                  <SectionHeading>Auf der Anlage</SectionHeading>
                  <div className="mt-4 bg-white p-5 ring-1 ring-line">
                    {nonempty(primary.location) ? (
                      <p className="inline-flex items-start gap-2 text-[15px] text-ink">
                        <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow" />
                        <span>
                          {primary.location}
                          {nonempty(primary.address) ? (
                            <>
                              <br />
                              <span className="text-muted">{primary.address}</span>
                            </>
                          ) : null}
                        </span>
                      </p>
                    ) : (
                      <p className={LIVE_TYPO.meta}>Ort wird noch bekannt gegeben.</p>
                    )}
                    {fieldCount > 0 ? (
                      <p className={cn(LIVE_TYPO.meta, "mt-3")}>
                        Felder:{" "}
                        {(stage?.fields ?? []).map((field) => field.name).join(" · ")}
                      </p>
                    ) : null}
                    {routeUrl ? (
                      <a
                        href={routeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                      >
                        Route öffnen
                      </a>
                    ) : null}
                  </div>
                </section>

                <div className="lg:hidden">
                  <SectionHeading>Teilen</SectionHeading>
                  <LiveShareActions
                    className="mt-4"
                    url={liveUrl}
                    title={`${primary.name} live – VfL Tournament Hub`}
                  />
                </div>
              </>
            ) : (
              <section>
                <SectionHeading>Nächste Turniere</SectionHeading>
                {upcoming.length === 0 ? (
                  <p className="mt-4 text-[15px] text-muted">
                    Aktuell sind keine kommenden Turniere geplant.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {upcoming.map((tournament) => (
                      <SideTournamentCard
                        key={tournament.id}
                        tournament={tournament}
                        href={`/turniere/${tournament.slug}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="grid gap-8 lg:sticky lg:top-6">
            {primary ? (
              <>
                <section className="hidden lg:block">
                  <SectionHeading>Teilen</SectionHeading>
                  <LiveShareActions
                    className="mt-4"
                    url={liveUrl}
                    title={`${primary.name} live – VfL Tournament Hub`}
                  />
                </section>

                <section className="hidden lg:block">
                  <SectionHeading>Auf der Anlage</SectionHeading>
                  <div className="mt-4 bg-white p-5 ring-1 ring-line">
                    {nonempty(primary.location) ? (
                      <p className="inline-flex items-start gap-2 text-[15px] text-ink">
                        <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow" />
                        <span>
                          {primary.location}
                          {nonempty(primary.address) ? (
                            <>
                              <br />
                              <span className="text-muted">{primary.address}</span>
                            </>
                          ) : null}
                        </span>
                      </p>
                    ) : (
                      <p className={LIVE_TYPO.meta}>Ort wird noch bekannt gegeben.</p>
                    )}
                    {fieldCount > 0 ? (
                      <p className={cn(LIVE_TYPO.meta, "mt-3")}>
                        Felder:{" "}
                        {(stage?.fields ?? []).map((field) => field.name).join(" · ")}
                      </p>
                    ) : null}
                    {routeUrl ? (
                      <a
                        href={routeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                      >
                        Route öffnen
                      </a>
                    ) : null}
                  </div>
                </section>

                <section>
                  <SectionHeading>Kommende Turniere</SectionHeading>
                  {upcoming.length === 0 ? (
                    <p className="mt-3 text-[14px] text-muted">Keine weiteren Termine.</p>
                  ) : (
                    <div className="mt-3 grid gap-3">
                      {upcoming.map((tournament) => (
                        <SideTournamentCard
                          key={tournament.id}
                          tournament={tournament}
                          href={`/turniere/${tournament.slug}`}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}

            <section>
              <SectionHeading>Vergangene Turniere</SectionHeading>
              {past.length === 0 ? (
                <p className="mt-3 text-[14px] text-muted">Noch keine vergangenen Turniere.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {past.map((tournament) => (
                    <SideTournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      href={`/turniere/${tournament.slug}`}
                    />
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </Container>
    </div>
  );
}
