/**
 * CL Release 5 — pure, safe club-assignment suggestions.
 *
 * Suggests an existing club for each unassigned participant by comparing team
 * and club names. It NEVER assigns automatically when a match is uncertain:
 * only an exact normalized name match is "safe"; everything else is returned as
 * a suggestion that the admin must confirm. This keeps the same-club fail-safe
 * intact — a wrong club id must never be written silently.
 *
 * No database, no React, no server actions.
 */

export type ClubOption = { id: string; name: string };

export type ParticipantClubState = {
  participantId: string;
  teamName: string;
  /** Optional club-name hint carried on the team (e.g. an external club_name). */
  clubNameHint?: string | null;
  clubId: string | null;
};

export type ClubMatchConfidence = "exact" | "strong" | "weak" | "none";

export type ClubSuggestion = {
  participantId: string;
  teamName: string;
  suggestedClubId: string | null;
  suggestedClubName: string | null;
  confidence: ClubMatchConfidence;
  /** False only for an exact normalized name match; every weaker match must be confirmed. */
  safe: boolean;
  reason: string;
};

const TEAM_VARIANT_SUFFIX = /\s+(?:[0-9]{1,2}|i{1,3}|iv|v|vi{0,3}|[a-d]|u\s?\d{1,2}|[ivx]+)$/i;

/**
 * Generic German club-type prefixes. These must NEVER be the sole basis for a
 * match (two unrelated "TSV …" clubs are not the same club). They are excluded
 * from the distinctive-token overlap used for weak suggestions.
 */
const GENERIC_CLUB_TOKENS = new Set<string>([
  "tsv", "vfl", "vfb", "vfr", "fc", "fsv", "sv", "sg", "sgm", "sgs", "tv", "fv",
  "spvgg", "tsg", "djk", "ssv", "tus", "mtv", "sc", "bsc", "ksc", "svg", "tsf",
  "vf", "fcb", "jsg", "sge", "rsv", "post", "fsg", "jfv", "tb",
]);

/** Lowercased, whitespace-collapsed, diacritics folded. */
function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip trailing team-variant markers so "vfl kirchheim 1/2/ii" share a base. */
function clubBase(value: string): string {
  let base = normalize(value);
  // Repeatedly drop a trailing variant token (e.g. "... 1", "... ii", "... u13").
  for (let guard = 0; guard < 4; guard += 1) {
    const stripped = base.replace(TEAM_VARIANT_SUFFIX, "").trim();
    if (stripped === base || stripped.length === 0) {
      break;
    }
    base = stripped;
  }
  return base;
}

/** Distinctive tokens: length >= 3 and NOT a generic club-type prefix. */
function significantTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !GENERIC_CLUB_TOKENS.has(token)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) {
      count += 1;
    }
  }
  return count;
}

function bestMatch(
  teamName: string,
  clubNameHint: string | null | undefined,
  clubs: readonly ClubOption[],
): { club: ClubOption | null; confidence: ClubMatchConfidence; reason: string } {
  const candidates = [teamName, clubNameHint].filter((value): value is string => Boolean(value && value.trim()));
  if (candidates.length === 0 || clubs.length === 0) {
    return { club: null, confidence: "none", reason: "Kein Name zum Abgleich vorhanden." };
  }

  let strong: ClubOption | null = null;
  let weak: ClubOption | null = null;
  let weakScore = 0;

  for (const club of clubs) {
    const clubNorm = normalize(club.name);
    const clubBaseNorm = clubBase(club.name);
    for (const candidate of candidates) {
      const candidateBase = clubBase(candidate);
      const candidateNorm = normalize(candidate);
      if (candidateBase.length === 0) {
        continue;
      }
      // Exact: the variant-stripped bases are identical (VfL Kirchheim 1 == VfL Kirchheim 2 == VfL Kirchheim).
      if (candidateBase === clubBaseNorm || candidateNorm === clubNorm) {
        return { club, confidence: "exact", reason: `Name stimmt mit „${club.name}“ überein.` };
      }
      // Strong: one base is a prefix of the other.
      if (
        !strong &&
        (clubBaseNorm.startsWith(`${candidateBase} `) ||
          candidateBase.startsWith(`${clubBaseNorm} `) ||
          clubBaseNorm === candidateBase)
      ) {
        strong = club;
      }
      const overlap = tokenOverlap(significantTokens(candidate), significantTokens(club.name));
      if (overlap > weakScore) {
        weakScore = overlap;
        weak = club;
      }
    }
  }

  if (strong) {
    return { club: strong, confidence: "strong", reason: `Sehr ähnlich zu „${strong.name}“ – bitte bestätigen.` };
  }
  if (weak && weakScore > 0) {
    return { club: weak, confidence: "weak", reason: `Mögliche Übereinstimmung mit „${weak.name}“ – bitte prüfen.` };
  }
  return { club: null, confidence: "none", reason: "Kein passender Verein gefunden." };
}

/**
 * Build a confirmation-first suggestion for every participant without a club.
 * Already-assigned participants are skipped (clubId present).
 */
export function suggestClubAssignments(input: {
  participants: readonly ParticipantClubState[];
  clubs: readonly ClubOption[];
}): ClubSuggestion[] {
  const suggestions: ClubSuggestion[] = [];
  for (const participant of input.participants) {
    if (participant.clubId) {
      continue;
    }
    const match = bestMatch(participant.teamName, participant.clubNameHint, input.clubs);
    suggestions.push({
      participantId: participant.participantId,
      teamName: participant.teamName,
      suggestedClubId: match.club?.id ?? null,
      suggestedClubName: match.club?.name ?? null,
      confidence: match.confidence,
      safe: match.confidence === "exact",
      reason: match.reason,
    });
  }
  return suggestions;
}

/** Group participants by resolved club id (current or confirmed suggestion). */
export function participantsMissingClub(
  participants: readonly ParticipantClubState[],
): ParticipantClubState[] {
  return participants.filter((participant) => !participant.clubId);
}

/** Canonical key for duplicate detection (variant-stripped, normalized). */
export function clubCanonicalKey(name: string): string {
  return clubBase(name);
}

/**
 * Existing clubs that would duplicate `name` (same canonical key). Used to warn
 * BEFORE creating a club. Never merges — the admin decides.
 */
export function findDuplicateClubs<T extends ClubOption>(
  name: string,
  clubs: readonly T[],
): T[] {
  const key = clubCanonicalKey(name);
  if (!key) {
    return [];
  }
  return clubs.filter((club) => clubCanonicalKey(club.name) === key);
}

/** Assignment progress for the panel header, e.g. 8 of 10. */
export function clubAssignmentProgress(
  participants: readonly ParticipantClubState[],
): { assigned: number; total: number } {
  return {
    assigned: participants.filter((participant) => Boolean(participant.clubId)).length,
    total: participants.length,
  };
}
