import type { MatchStatus, TournamentMatchRecord } from "@/types/schedule";

export type LiveMatchPriority = "live" | "next" | "recent";

export type LiveMatchHighlight = TournamentMatchRecord & {
  priority: LiveMatchPriority;
};

function matchSortKey(match: TournamentMatchRecord) {
  return match.scheduledAt ?? `9999-${String(match.sortOrder).padStart(4, "0")}`;
}

/**
 * Compact "Jetzt / Als Nächstes" list:
 * 1) live matches
 * 2) next scheduled
 * 3) fill with recent completed
 */
export function selectLiveMatchHighlights(
  matches: TournamentMatchRecord[],
  limit = 5,
): LiveMatchHighlight[] {
  const eligible = matches.filter((match) => match.status !== "cancelled");

  const live = eligible
    .filter((match) => match.status === "live")
    .sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)))
    .map((match) => ({ ...match, priority: "live" as const }));

  const selected: LiveMatchHighlight[] = [...live];

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  const scheduled = eligible
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)))
    .map((match) => ({ ...match, priority: "next" as const }));

  for (const match of scheduled) {
    if (selected.length >= limit) {
      break;
    }
    selected.push(match);
  }

  if (selected.length >= limit) {
    return selected;
  }

  const completed = eligible
    .filter((match) => match.status === "completed")
    .sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)))
    .map((match) => ({ ...match, priority: "recent" as const }));

  for (const match of completed) {
    if (selected.length >= limit) {
      break;
    }
    selected.push(match);
  }

  return selected;
}

export function liveMatchStatusLabel(status: MatchStatus) {
  switch (status) {
    case "live":
      return "LIVE";
    case "completed":
      return "Beendet";
    case "cancelled":
      return "Abgesagt";
    default:
      return "Geplant";
  }
}
