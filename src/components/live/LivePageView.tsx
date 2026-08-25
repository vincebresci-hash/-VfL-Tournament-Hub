import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { MeinTurnierplanBadge } from "@/components/tournaments/MeinTurnierplanPublicButton";
import { IconCalendar, IconPin } from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import {
  resolveLiveTeam,
  type LivePageData,
  type LiveTeamRef,
} from "@/lib/db/live-queries";
import { liveMatchStatusLabel } from "@/lib/live/live-matches";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import { formatDateDe, formatTimeDe } from "@/lib/format";
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

function scoreLabel(match: TournamentMatchRecord) {
  if (match.homeScore == null || match.awayScore == null) {
    return "–";
  }
  return `${match.homeScore}:${match.awayScore}`;
}

function matchContextLabel(
  match: TournamentMatchRecord,
  groupNameById: Map<string, string>,
  fieldNameById: Map<string, string>,
) {
  const parts: string[] = [];
  if (match.groupId) {
    parts.push(groupNameById.get(match.groupId) ?? "Gruppe");
  } else if (match.round) {
    parts.push(knockoutRoundLabel[match.round] ?? "KO");
  }
  if (match.fieldId) {
    parts.push(fieldNameById.get(match.fieldId) ?? "Feld");
  }
  return parts.join(" · ") || "Spiel";
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
      className="block border border-line bg-white p-4 transition-colors hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
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

function MatchRow({
  match,
  home,
  away,
  context,
}: {
  match: TournamentMatchRecord;
  home: LiveTeamRef;
  away: LiveTeamRef;
  context: string;
}) {
  return (
    <article className="border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>
          {formatBerlinClock(match.scheduledAt)} · {context}
        </span>
        <span
          className={cn(
            "font-semibold tracking-[0.08em] uppercase",
            match.status === "live" ? "text-brand-red" : "text-ink",
          )}
        >
          {liveMatchStatusLabel(match.status)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <ParticipantClubLogo logoUrl={home.logoUrl} clubName={home.clubName} />
          <span className="truncate text-[14px] font-medium text-ink">{home.label}</span>
        </div>
        <span className="font-display text-xl font-bold text-ink tabular-nums">
          {scoreLabel(match)}
        </span>
        <div className="flex min-w-0 items-center gap-2 justify-self-end text-right">
          <span className="truncate text-[14px] font-medium text-ink">{away.label}</span>
          <ParticipantClubLogo logoUrl={away.logoUrl} clubName={away.clubName} />
        </div>
      </div>
    </article>
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
    highlightMatches,
    recentResults,
    groups,
    participants,
    capacity,
    meinTurnierplanActive,
    showLiveSpielplanCta,
  } = data;

  const groupNameById = new Map((stage?.groups ?? []).map((group) => [group.id, group.name]));
  const fieldNameById = new Map((stage?.fields ?? []).map((field) => [field.id, field.name]));
  const primaryEffectiveStatus = primary
    ? getEffectiveTournamentStatus({
        dbStatus: primary.status,
        maxTeams: primary.maxTeams,
        confirmedParticipants: primary.confirmedTeams,
        archivedAt: primary.archivedAt,
      })
    : null;

  return (
    <div className="bg-surface">
      {primary ? (
        <section className="relative overflow-hidden bg-navy text-white">
          <div className="absolute inset-0">
            <CoverImage
              src={primary.image}
              alt=""
              className="h-full w-full"
              sizes="100vw"
              objectPosition="50% 40%"
              imageClassName="opacity-35"
              preload
            />
            <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-navy/55" />
          </div>

          <Container className="relative py-10 sm:py-14 lg:py-16">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 bg-brand-yellow px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-navy uppercase">
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

              <h1 className="mt-5 font-display text-4xl font-bold tracking-wide uppercase sm:text-5xl lg:text-6xl">
                {primary.name}
              </h1>

              <p className="mt-4 text-[15px] text-white/75 sm:text-base">
                {[
                  primary.ageGroup,
                  primary.birthYear ? `Jahrgang ${primary.birthYear}` : null,
                  formatDateDe(primary.date),
                  formatTimeDe(primary.startTime),
                  formatTimeDe(primary.endTime)
                    ? `bis ${formatTimeDe(primary.endTime)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <div className="mt-6 grid gap-3 text-[14px] text-white/85 sm:grid-cols-2">
                {nonempty(primary.location) ? (
                  <p className="inline-flex items-start gap-2">
                    <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow" />
                    <span>
                      {primary.location}
                      {nonempty(primary.address) ? (
                        <>
                          <br />
                          <span className="text-white/65">{primary.address}</span>
                        </>
                      ) : null}
                    </span>
                  </p>
                ) : null}
                {capacity ? (
                  <p>
                    Teilnehmer {capacity.confirmedTeams} / {capacity.maxTeams}
                    {capacity.availableSlots > 0
                      ? ` · ${capacity.availableSlots} frei`
                      : ""}
                  </p>
                ) : primary.confirmedTeams > 0 ? (
                  <p>Teilnehmer {primary.confirmedTeams}</p>
                ) : null}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/turniere/${primary.slug}`}
                  className="inline-flex h-11 items-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
                >
                  Zum vollständigen Turnier →
                </Link>
                {showLiveSpielplanCta && primary.meinTurnierplanUrl ? (
                  <a
                    href={primary.meinTurnierplanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center border border-white/35 px-5 text-[12px] font-semibold tracking-[0.08em] text-white uppercase hover:border-white/70"
                  >
                    Live-Spielplan öffnen
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

      <Container className="py-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="grid gap-8">
            {todayAlso.length > 0 ? (
              <section>
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                  Heute außerdem
                </h2>
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
                <section>
                  <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                    Jetzt / Als Nächstes
                  </h2>
                  {highlightMatches.length === 0 ? (
                    <p className="mt-4 text-[15px] text-muted">
                      Noch keine Spieldaten für den Live-Tag verfügbar.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {highlightMatches.map((match) => (
                        <MatchRow
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
                          context={matchContextLabel(match, groupNameById, fieldNameById)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {recentResults.length > 0 ? (
                  <section>
                    <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                      Letzte Ergebnisse
                    </h2>
                    <div className="mt-4 grid gap-3">
                      {recentResults.map((match) => (
                        <MatchRow
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
                          context={matchContextLabel(match, groupNameById, fieldNameById)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {groups.length > 0 ? (
                  <section>
                    <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                      Gruppen / Tabelle
                    </h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {groups.map((group) => (
                        <article key={group.id} className="border border-line bg-white p-4">
                          <h3 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                            {group.name}
                          </h3>
                          {group.standings.length > 0 ? (
                            <table className="mt-3 w-full text-left text-[13px]">
                              <thead>
                                <tr className="text-[11px] tracking-[0.08em] text-muted uppercase">
                                  <th className="pb-2 font-semibold">Pl</th>
                                  <th className="pb-2 font-semibold">Team</th>
                                  <th className="pb-2 font-semibold">Sp</th>
                                  <th className="pb-2 font-semibold">Pkt</th>
                                  <th className="pb-2 font-semibold">Diff</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.standings.map((row) => (
                                  <tr key={`${group.id}-${row.team.id}`} className="border-t border-line">
                                    <td className="py-2 pr-2 tabular-nums">{row.rank}</td>
                                    <td className="py-2 pr-2">
                                      <span className="inline-flex items-center gap-2">
                                        <ParticipantClubLogo
                                          logoUrl={row.team.logoUrl}
                                          clubName={row.team.clubName}
                                          className="!h-7 !w-7"
                                        />
                                        <span className="line-clamp-1">{row.team.label}</span>
                                      </span>
                                    </td>
                                    <td className="py-2 pr-2 tabular-nums">{row.played}</td>
                                    <td className="py-2 pr-2 tabular-nums">{row.points}</td>
                                    <td className="py-2 tabular-nums">{row.goalDiff}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <ul className="mt-3 grid gap-2">
                              {group.teams.map((team) => (
                                <li key={team.id} className="flex items-center gap-2 text-[14px] text-ink">
                                  <ParticipantClubLogo
                                    logoUrl={team.logoUrl}
                                    clubName={team.clubName}
                                    className="!h-7 !w-7"
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
                    <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                      Teilnehmer
                    </h2>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {participants.map((team) => (
                        <li
                          key={team.id}
                          className="flex items-center gap-3 border border-line bg-white px-3 py-2.5 text-[14px] text-ink"
                        >
                          <ParticipantClubLogo logoUrl={team.logoUrl} clubName={team.clubName} />
                          <span className="line-clamp-2">{team.label}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <div>
                  <Link
                    href={`/turniere/${primary.slug}`}
                    className="inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                  >
                    Zum vollständigen Turnier →
                  </Link>
                </div>
              </>
            ) : (
              <section>
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
                  Nächste Turniere
                </h2>
                {upcoming.length === 0 ? (
                  <p className="mt-4 text-[15px] text-muted">Aktuell sind keine kommenden Turniere geplant.</p>
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
              <section>
                <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                  Kommende Turniere
                </h2>
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
            ) : null}

            <section>
              <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                Vergangene Turniere
              </h2>
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
