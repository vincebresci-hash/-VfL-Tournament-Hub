/**
 * C6-H D4 — Pure admin Matchday Dashboard presentation model.
 *
 * Orchestration/read-model only: counts, filters, maps, advisory copy.
 * No lifecycle/standings/qualification/completion/regen/lock algorithms.
 */

import {
  selectNextMatches,
  selectOtherLiveMatches,
  selectPrimaryMatchMoment,
  selectRecentResults,
  type PrimaryMatchMoment,
} from "@/lib/live/match-center";
import { canMutateGroupResults } from "@/lib/schedule/group-result-lock";
import { GROUP_RESULT_LOCK_CORRECTION_MESSAGE } from "@/lib/schedule/group-result-lock-ux";
import { isGroupStageComplete } from "@/lib/schedule/knockout";
import { TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT } from "@/lib/schedule/tournament-lifecycle-labels";
import {
  isTournamentCompletionEligible,
  type TournamentLifecycleState,
} from "@/lib/schedule/tournament-lifecycle";
import type { TournamentMatchRecord } from "@/types/schedule";

export const MATCHDAY_ATTENTION_KINDS = [
  "setup_groups_missing",
  "group_schedule_missing",
  "group_results_pending",
  "qualification_ready",
  "ko_in_progress",
  "completion_available",
  "completed",
] as const;

export type MatchdayAttentionKind = (typeof MATCHDAY_ATTENTION_KINDS)[number];

export type MatchdayQuickActionKey =
  | "groups"
  | "schedule"
  | "results"
  | "knockout"
  | "edit";

export type MatchdayDashboardPermissions = {
  canScheduleManage: boolean;
  canResultsManage: boolean;
  canTournamentsManage: boolean;
};

export type BuildTournamentMatchdayDashboardModelInput = {
  tournamentId: string;
  /** Server-authoritative effective lifecycle — never persisted alone. */
  effective: TournamentLifecycleState;
  groups: Array<{ id: string }>;
  memberIdsByGroupId: Record<string, string[]>;
  matches: readonly TournamentMatchRecord[];
  permissions: MatchdayDashboardPermissions;
};

export type MatchdayAttention = {
  kind: MatchdayAttentionKind;
  title: string;
  href: string | null;
  linkLabel: string | null;
};

export type MatchdayQuickAction = {
  key: MatchdayQuickActionKey;
  label: string;
  hint: string;
  href: string;
  emphasized: boolean;
};

export type TournamentMatchdayDashboardModel = {
  effective: TournamentLifecycleState;
  attention: MatchdayAttention;
  /** Secondary advisory when KO presence locks group results (C6-F). */
  correctionWarning: string | null;
  groupResultsLocked: boolean;
  progress: {
    teamCount: number;
    groupCount: number;
    groupMatchCount: number;
    koMatchCount: number;
    koCompletedCount: number;
    groupProgress: { complete: boolean; expected: number; completed: number };
    groupProgressLabel: string;
    koProgressLabel: string | null;
    overallCompleted: number;
    overallTotal: number;
    completionEligible: boolean;
  };
  matchLists: {
    primary: PrimaryMatchMoment;
    live: TournamentMatchRecord[];
    next: TournamentMatchRecord[];
    recent: TournamentMatchRecord[];
  };
  quickActions: MatchdayQuickAction[];
};

function isGroupPhaseMatch(match: TournamentMatchRecord) {
  return match.phase !== "knockout";
}

function resolveAttention(input: {
  effective: TournamentLifecycleState;
  base: string;
  groupScheduleExists: boolean;
  groupComplete: boolean;
  completionEligible: boolean;
}): MatchdayAttention {
  const { effective, base, groupScheduleExists, groupComplete, completionEligible } =
    input;

  if (effective === "completed") {
    return {
      kind: "completed",
      title: "Turnier abgeschlossen",
      href: null,
      linkLabel: null,
    };
  }

  if (effective === "knockout_stage") {
    if (completionEligible) {
      return {
        kind: "completion_available",
        title: "Turnier kann abgeschlossen werden",
        href: `${base}/ko-runde`,
        linkLabel: "Zur K.-o.-Runde",
      };
    }
    return {
      kind: "ko_in_progress",
      title: "K.-o.-Phase läuft",
      href: `${base}/ko-runde`,
      linkLabel: "Zur K.-o.-Runde",
    };
  }

  if (effective === "group_stage") {
    if (!groupScheduleExists) {
      return {
        kind: "group_schedule_missing",
        title: "Spielplan fehlt",
        href: `${base}/spielplan`,
        linkLabel: "Zum Spielplan",
      };
    }
    if (!groupComplete) {
      return {
        kind: "group_results_pending",
        title: "Gruppenergebnisse offen",
        href: `${base}/ergebnisse`,
        linkLabel: "Zu den Ergebnissen",
      };
    }
    return {
      kind: "qualification_ready",
      title: "Qualifikation bereit",
      href: `${base}/ko-runde`,
      linkLabel: "Zur K.-o.-Runde",
    };
  }

  // setup (and any unexpected fallthrough)
  return {
    kind: "setup_groups_missing",
    title: "Gruppen fehlen",
    href: `${base}/gruppen`,
    linkLabel: "Gruppen verwalten",
  };
}

/**
 * Pure Matchday Dashboard presentation model.
 * Consumes effective lifecycle + stage rows; reuses C6-G/C6-F/completion helpers.
 */
export function buildTournamentMatchdayDashboardModel(
  input: BuildTournamentMatchdayDashboardModelInput,
): TournamentMatchdayDashboardModel {
  const { tournamentId, effective, groups, memberIdsByGroupId, matches, permissions } =
    input;
  const base = `/admin/turniere/${tournamentId}`;
  const matchList = [...matches];

  const groupMatches = matchList.filter(isGroupPhaseMatch);
  const koMatches = matchList.filter((match) => match.phase === "knockout");
  const groupScheduleExists = groupMatches.length > 0;

  // C6-G authoritative completeness — do not re-derive expected counts.
  const groupProgress = isGroupStageComplete(groups, memberIdsByGroupId, matchList);

  // Existing final-winner completion gate — no independent winner resolution.
  const completionEligible = isTournamentCompletionEligible(matchList);

  // C6-F authoritative lock — ANY KO row including cancelled.
  const lock = canMutateGroupResults(matchList);
  const groupResultsLocked = !lock.allowed;

  const attention = resolveAttention({
    effective,
    base,
    groupScheduleExists,
    groupComplete: groupProgress.complete,
    completionEligible,
  });

  const koCompletedCount = koMatches.filter(
    (match) => match.status === "completed",
  ).length;
  const groupCompletedForOverall = groupMatches.filter(
    (match) => match.status === "completed",
  ).length;

  const teamIds = new Set<string>();
  for (const ids of Object.values(memberIdsByGroupId)) {
    for (const id of ids) {
      teamIds.add(id);
    }
  }

  const primary = selectPrimaryMatchMoment(matchList);
  const primaryLiveId =
    primary.kind === "live" && primary.match ? primary.match.id : null;
  const live =
    primary.kind === "live" && primary.match
      ? [primary.match, ...selectOtherLiveMatches(matchList, primaryLiveId)]
      : [];
  const next = selectNextMatches(matchList, null, 5);
  const recent = selectRecentResults(matchList, 3);

  const quickActions: MatchdayQuickAction[] = [
    {
      key: "groups",
      label: "Gruppen verwalten",
      hint: "Gruppen und Zuordnung",
      href: `${base}/gruppen`,
      emphasized: permissions.canScheduleManage,
    },
    {
      key: "schedule",
      label: "Spielplan",
      hint: "Spiele und Zeiten",
      href: `${base}/spielplan`,
      emphasized: permissions.canScheduleManage,
    },
    {
      key: "results",
      label: "Ergebnisse",
      hint: "Ergebnisse erfassen",
      href: `${base}/ergebnisse`,
      emphasized: permissions.canScheduleManage,
    },
    {
      key: "knockout",
      label: "K.-o.-Runde",
      hint: "K.o.-Phase verwalten",
      href: `${base}/ko-runde`,
      emphasized: permissions.canResultsManage,
    },
    {
      key: "edit",
      label: "Bearbeiten",
      hint: "Einstellungen und Marketing",
      href: `${base}/bearbeiten`,
      emphasized: permissions.canTournamentsManage,
    },
  ];

  return {
    effective,
    attention,
    correctionWarning: groupResultsLocked
      ? `${TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT} ${GROUP_RESULT_LOCK_CORRECTION_MESSAGE}`
      : null,
    groupResultsLocked,
    progress: {
      teamCount: teamIds.size,
      groupCount: groups.length,
      groupMatchCount: groupMatches.length,
      koMatchCount: koMatches.length,
      koCompletedCount,
      groupProgress,
      groupProgressLabel: `${groupProgress.completed} von ${groupProgress.expected} Gruppenspielen abgeschlossen`,
      koProgressLabel:
        koMatches.length > 0
          ? `${koCompletedCount} von ${koMatches.length} K.-o.-Spielen abgeschlossen`
          : null,
      overallCompleted: groupCompletedForOverall + koCompletedCount,
      overallTotal: groupMatches.length + koMatches.length,
      completionEligible,
    },
    matchLists: {
      primary,
      live,
      next,
      recent,
    },
    quickActions,
  };
}
