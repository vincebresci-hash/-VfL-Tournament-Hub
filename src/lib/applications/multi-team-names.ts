/** Max teams per multi-team submission in PR-B. */
export const MULTI_TEAM_APPLICATION_MAX = 3;

const ROMAN_SUFFIXES = ["I", "II", "III"] as const;

/** Matches a terminal youth-football Roman team suffix (I–V). */
const TERMINAL_ROMAN_SUFFIX = /\s+(I{1,3}|IV|V)$/i;

/**
 * Build distinct guest application team names for a multi-team submission.
 * N = 1 returns the trimmed base unchanged.
 * N > 1 appends Roman suffixes; strips an existing terminal Roman suffix first
 * so "U9 I" + 2 does not become "U9 I I".
 */
export function buildGuestMultiTeamNames(
  baseName: string,
  count: number,
): string[] {
  const trimmed = baseName.trim();
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("team count must be a positive integer");
  }
  if (count === 1) {
    return [trimmed];
  }
  if (count > MULTI_TEAM_APPLICATION_MAX) {
    throw new Error("team count exceeds multi-team maximum");
  }

  const stripped = trimmed.replace(TERMINAL_ROMAN_SUFFIX, "").trim() || trimmed;

  return Array.from({ length: count }, (_, index) => {
    const suffix = ROMAN_SUFFIXES[index];
    if (!suffix) {
      throw new Error("team count exceeds supported Roman suffixes");
    }
    return `${stripped} ${suffix}`;
  });
}

export function formatMultiTeamNamesForEmail(teamNames: string[]): string {
  return teamNames.map((name) => name.trim()).filter(Boolean).join(", ");
}
