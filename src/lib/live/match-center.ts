import type { TournamentMatchRecord } from "@/types/schedule";

export const LIVE_TYPO = {
  display: "font-display text-4xl font-bold tracking-wide uppercase sm:text-5xl lg:text-6xl",
  title: "font-display text-2xl font-bold tracking-wide uppercase sm:text-3xl",
  section: "font-display text-lg font-bold tracking-wide text-ink uppercase sm:text-xl",
  body: "text-[15px] leading-6 text-ink sm:text-base",
  meta: "text-[12px] leading-5 tracking-[0.04em] text-muted sm:text-[13px]",
  badge: "inline-flex h-7 items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-[0.12em] uppercase",
} as const;

export const LIVE_LOGO_SIZE = {
  sm: 32,
  md: 40,
  lg: 48,
} as const;

export type LiveLogoSize = keyof typeof LIVE_LOGO_SIZE;

export type MatchCardVariant = "live" | "next" | "completed";

export type PrimaryMatchMoment =
  | { kind: "live"; match: TournamentMatchRecord }
  | { kind: "next"; match: TournamentMatchRecord }
  | { kind: "none"; match: null };

function matchSortAsc(a: TournamentMatchRecord, b: TournamentMatchRecord) {
  const aKey = a.scheduledAt ?? `9999-${String(a.sortOrder).padStart(4, "0")}`;
  const bKey = b.scheduledAt ?? `9999-${String(b.sortOrder).padStart(4, "0")}`;
  return aKey.localeCompare(bKey);
}

function matchSortDesc(a: TournamentMatchRecord, b: TournamentMatchRecord) {
  return matchSortAsc(b, a);
}

export function selectPrimaryMatchMoment(
  matches: TournamentMatchRecord[],
): PrimaryMatchMoment {
  const eligible = matches.filter((match) => match.status !== "cancelled");
  const live = eligible.filter((match) => match.status === "live").sort(matchSortAsc);
  if (live[0]) {
    return { kind: "live", match: live[0] };
  }

  const next = eligible.filter((match) => match.status === "scheduled").sort(matchSortAsc);
  if (next[0]) {
    return { kind: "next", match: next[0] };
  }

  return { kind: "none", match: null };
}

export function selectOtherLiveMatches(
  matches: TournamentMatchRecord[],
  primaryId: string | null,
) {
  return matches
    .filter((match) => match.status === "live" && match.id !== primaryId)
    .sort(matchSortAsc);
}

export function selectNextMatches(
  matches: TournamentMatchRecord[],
  primaryId: string | null,
  limit = 5,
) {
  return matches
    .filter((match) => match.status === "scheduled" && match.id !== primaryId)
    .sort(matchSortAsc)
    .slice(0, limit);
}

export function selectRecentResults(matches: TournamentMatchRecord[], limit = 5) {
  return matches
    .filter((match) => match.status === "completed")
    .sort(matchSortDesc)
    .slice(0, limit);
}

export function matchCardVariantFor(match: TournamentMatchRecord): MatchCardVariant {
  if (match.status === "live") {
    return "live";
  }
  if (match.status === "completed") {
    return "completed";
  }
  return "next";
}

export function formatUpdatedAgo(iso: string | null | undefined, now = new Date()) {
  if (!iso) {
    return null;
  }
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return null;
  }
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "Aktualisiert gerade eben";
  }
  if (minutes === 1) {
    return "Aktualisiert vor 1 Min.";
  }
  if (minutes < 60) {
    return `Aktualisiert vor ${minutes} Min.`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours === 1) {
    return "Aktualisiert vor 1 Std.";
  }
  return `Aktualisiert vor ${hours} Std.`;
}

export function mapsSearchUrl(location: string | null | undefined, address: string | null | undefined) {
  const query = [address?.trim(), location?.trim()].filter(Boolean).join(", ");
  if (!query) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function nextMatchForParticipant(
  matches: TournamentMatchRecord[],
  participantId: string,
) {
  const upcoming = matches
    .filter((match) => match.status === "scheduled" || match.status === "live")
    .filter((match) => {
      const home = match.homeApplicationId ?? match.homeExternalTeamId;
      const away = match.awayApplicationId ?? match.awayExternalTeamId;
      return home === participantId || away === participantId;
    })
    .sort(matchSortAsc);
  return upcoming[0] ?? null;
}
