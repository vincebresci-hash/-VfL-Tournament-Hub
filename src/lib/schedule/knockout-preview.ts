/**
 * C6-G D1 — Shared pure qualification / knockout planning projection.
 *
 * Packages the exact generate-time composition:
 * completeness → standings → qualifyTopTwo → buildKnockoutPlan
 *
 * Does not invent qualification, standings, or bracket rules.
 * Preview and generateKnockoutAction must both consume this helper.
 */

import {
  buildKnockoutPlan,
  isGroupStageComplete,
  qualifyTopTwo,
  type KnockoutOptions,
  type KnockoutPlanMatch,
  type QualifiedTeam,
} from "@/lib/schedule/knockout";
import {
  computeGroupStandings,
  type StandingsMatch,
} from "@/lib/schedule/standings";
import type { MatchStatus, StandingRow } from "@/types/schedule";

export type KnockoutPreviewMatch = StandingsMatch & {
  groupId: string | null;
  phase?: string;
  status: MatchStatus;
};

export type KnockoutQualificationPreviewInput = {
  groups: Array<{ id: string }>;
  memberIdsByGroupId: Record<string, string[]>;
  matches: readonly KnockoutPreviewMatch[];
  options: KnockoutOptions;
};

export type GroupStageProgress = {
  complete: boolean;
  expected: number;
  completed: number;
};

export type KnockoutQualificationPreview = {
  progress: GroupStageProgress;
  standingsByGroupId: Record<string, StandingRow[]>;
  qualifiers: QualifiedTeam[];
  plan: { matches: KnockoutPlanMatch[]; error: string | null };
  /** Seeded first-round matches (both sides resolved). Later rounds stay in plan.matches. */
  firstRoundMatches: KnockoutPlanMatch[];
};

function groupMatchesForStandings(
  groupId: string,
  matches: readonly KnockoutPreviewMatch[],
): StandingsMatch[] {
  return matches.filter(
    (match) => match.groupId === groupId && match.phase !== "knockout",
  );
}

/**
 * Pure planning projection used by KO generation and C6-G preview.
 * Semantics match the pre-D1 inlined generateKnockoutAction composition.
 */
export function buildKnockoutQualificationPreview(
  input: KnockoutQualificationPreviewInput,
): KnockoutQualificationPreview {
  const { groups, memberIdsByGroupId, matches, options } = input;

  const progress = isGroupStageComplete(groups, memberIdsByGroupId, [...matches]);

  const standingsByGroupId = Object.fromEntries(
    groups.map((group) => [
      group.id,
      computeGroupStandings(
        memberIdsByGroupId[group.id] ?? [],
        groupMatchesForStandings(group.id, matches),
      ),
    ]),
  );

  const qualifiers = qualifyTopTwo(groups, standingsByGroupId);
  const plan = buildKnockoutPlan(options, qualifiers);
  const firstRoundMatches = plan.matches.filter(
    (match) => match.homeId != null && match.awayId != null,
  );

  return {
    progress,
    standingsByGroupId,
    qualifiers,
    plan,
    firstRoundMatches,
  };
}
