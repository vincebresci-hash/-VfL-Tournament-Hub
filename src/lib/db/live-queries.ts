import { listPublicTournaments } from "@/lib/db/tournament-queries";
import {
  getPublicTournamentStage,
  type PublicTournamentStage,
} from "@/lib/db/schedule-queries";
import {
  getPublicMeinTurnierplanData,
  type PublicMeinTurnierplanData,
} from "@/lib/mein-turnierplan-public-data";
import {
  isMeinTurnierplanPublic,
  showsMeinTurnierplanLiveTab,
} from "@/lib/mein-turnierplan";
import { getDisplayCapacity } from "@/lib/public-tournament";
import { computeGroupStandings } from "@/lib/schedule/standings";
import { publicTeamLabel } from "@/lib/schedule/names";
import { selectLiveMatchHighlights } from "@/lib/live/live-matches";
import {
  hasActiveLiveTournamentToday,
  selectLivePageTournaments,
  type LiveTournamentSelection,
} from "@/lib/live/select-live-tournament";
import type { PublicTournament } from "@/types/tournament";
import type { PublicRosterEntry, TournamentMatchRecord } from "@/types/schedule";

export type LiveTeamRef = {
  id: string;
  label: string;
  clubName: string;
  teamName: string;
  logoUrl: string | null;
};

export type LiveGroupSummary = {
  id: string;
  name: string;
  teams: LiveTeamRef[];
  standings: Array<{
    rank: number;
    team: LiveTeamRef;
    played: number;
    points: number;
    goalDiff: number;
  }>;
};

export type LivePageData = {
  selection: LiveTournamentSelection;
  primary: PublicTournament | null;
  todayAlso: PublicTournament[];
  upcoming: PublicTournament[];
  past: PublicTournament[];
  stage: PublicTournamentStage | null;
  teamMap: Map<string, LiveTeamRef>;
  highlightMatches: ReturnType<typeof selectLiveMatchHighlights>;
  recentResults: TournamentMatchRecord[];
  groups: LiveGroupSummary[];
  participants: LiveTeamRef[];
  capacity: ReturnType<typeof getDisplayCapacity>;
  meinTurnierplanActive: boolean;
  showLiveSpielplanCta: boolean;
  meinTurnierplanPublic: PublicMeinTurnierplanData | null;
};

export function rosterTeamMap(roster: PublicRosterEntry[]) {
  const map = new Map<string, LiveTeamRef>();
  for (const entry of roster) {
    const id = entry.externalTeamId ?? entry.applicationId;
    const ref: LiveTeamRef = {
      id,
      label: publicTeamLabel(entry.clubName, entry.teamName),
      clubName: entry.clubName,
      teamName: entry.teamName,
      logoUrl: entry.logoUrl ?? null,
    };
    map.set(id, ref);
    map.set(entry.applicationId, ref);
    if (entry.externalTeamId) {
      map.set(entry.externalTeamId, ref);
    }
  }
  return map;
}

export function resolveLiveTeam(
  map: Map<string, LiveTeamRef>,
  applicationId: string | null | undefined,
  externalTeamId: string | null | undefined,
): LiveTeamRef {
  const id = applicationId ?? externalTeamId ?? null;
  if (id && map.has(id)) {
    return map.get(id)!;
  }

  return {
    id: id ?? "unknown",
    label: "steht noch nicht fest",
    clubName: "Team",
    teamName: "",
    logoUrl: null,
  };
}

function buildGroupSummaries(
  stage: PublicTournamentStage,
  teams: Map<string, LiveTeamRef>,
): LiveGroupSummary[] {
  return stage.groups.map((group) => {
    const members = stage.roster
      .filter((entry) => entry.groupId === group.id)
      .sort((a, b) => a.clubName.localeCompare(b.clubName, "de"));

    const memberIds = members.map((entry) => entry.externalTeamId ?? entry.applicationId);
    const groupMatches = stage.matches.filter(
      (match) => match.phase === "group" && match.groupId === group.id,
    );
    const standings = computeGroupStandings(memberIds, groupMatches).slice(0, 4);

    return {
      id: group.id,
      name: group.name,
      teams: members.map((entry) => ({
        id: entry.externalTeamId ?? entry.applicationId,
        label: publicTeamLabel(entry.clubName, entry.teamName),
        clubName: entry.clubName,
        teamName: entry.teamName,
        logoUrl: entry.logoUrl ?? null,
      })),
      standings: standings.map((row) => ({
        rank: row.rank,
        team: resolveLiveTeam(teams, row.applicationId, null),
        played: row.played,
        points: row.points,
        goalDiff: row.goalDiff,
      })),
    };
  });
}

function emptyLivePageData(
  selection: LiveTournamentSelection,
  todayAlso: PublicTournament[],
  upcoming: PublicTournament[],
  past: PublicTournament[],
): LivePageData {
  return {
    selection,
    primary: null,
    todayAlso,
    upcoming,
    past,
    stage: null,
    teamMap: new Map(),
    highlightMatches: [],
    recentResults: [],
    groups: [],
    participants: [],
    capacity: null,
    meinTurnierplanActive: false,
    showLiveSpielplanCta: false,
    meinTurnierplanPublic: null,
  };
}

export async function getLivePageData(now = new Date()): Promise<LivePageData> {
  const tournaments = await listPublicTournaments();
  const selection = selectLivePageTournaments(tournaments, { now });
  const tournamentsById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));

  const primary = selection.primary
    ? (tournamentsById.get(selection.primary.id) ?? null)
    : null;
  const todayAlso = selection.todayAlso
    .map((entry) => tournamentsById.get(entry.id))
    .filter((entry): entry is PublicTournament => Boolean(entry));
  const upcoming = selection.upcoming
    .map((entry) => tournamentsById.get(entry.id))
    .filter((entry): entry is PublicTournament => Boolean(entry));
  const past = selection.past
    .map((entry) => tournamentsById.get(entry.id))
    .filter((entry): entry is PublicTournament => Boolean(entry));

  if (!primary) {
    return emptyLivePageData(selection, todayAlso, upcoming, past);
  }

  const [stage, meinTurnierplanPublic] = await Promise.all([
    getPublicTournamentStage(primary.slug, primary.id),
    getPublicMeinTurnierplanData(primary),
  ]);

  const teamMap = rosterTeamMap(stage.roster);
  const participants = stage.roster
    .map((entry) => ({
      id: entry.externalTeamId ?? entry.applicationId,
      label: publicTeamLabel(entry.clubName, entry.teamName),
      clubName: entry.clubName,
      teamName: entry.teamName,
      logoUrl: entry.logoUrl ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  return {
    selection,
    primary,
    todayAlso,
    upcoming,
    past,
    stage,
    teamMap,
    highlightMatches: selectLiveMatchHighlights(stage.matches, 5),
    recentResults: stage.matches
      .filter((match) => match.status === "completed")
      .sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""))
      .slice(0, 5),
    groups: buildGroupSummaries(stage, teamMap),
    participants,
    capacity: getDisplayCapacity(primary),
    meinTurnierplanActive: isMeinTurnierplanPublic(primary),
    showLiveSpielplanCta: showsMeinTurnierplanLiveTab(primary),
    meinTurnierplanPublic,
  };
}

export async function getHasActiveLiveTournamentToday(now = new Date()) {
  const tournaments = await listPublicTournaments();
  return hasActiveLiveTournamentToday(tournaments, now);
}
