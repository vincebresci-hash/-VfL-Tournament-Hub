/**
 * CL Release 6 — central team display-name logic.
 *
 * One source of truth for how a team is shown everywhere (participant admin,
 * schedule preview, saved schedule, league table, groups, results, knockout,
 * public pages, PDF). It keeps the CLUB IDENTITY (canonical) separate from the
 * DISPLAY NAME, never rewrites the stored application/team data, and never
 * merges distinct teams that happen to render the same.
 *
 * Rules (from the release examples):
 *  - A manual override always wins (e.g. "TV Altenstadt B2").
 *  - Age-group suffixes are dropped (U16, B-Jugend/"Bjugend", Bambini, …).
 *  - Team numbers / distinguishing codes are kept ("1", "2", "II", "B2").
 *  - No redundant "Club · Club 1" — if the team name already carries the club,
 *    the team name is the label ("VfL Kirchheim 1").
 *  - A short acronym that loses the club ("SGS" for "SG Sonnenhof Großaspach")
 *    yields the full club name; a concise variant that keeps the key tokens
 *    ("SGM Neckartenzlingen/Grafenberg") is kept.
 */

export type TeamDisplayNameInput = {
  clubName?: string | null;
  teamName?: string | null;
  /** Manual, admin-edited display name. Wins verbatim when set. */
  override?: string | null;
};

const AGE_SUFFIX_PATTERNS: RegExp[] = [
  /^u\s?\d{1,2}$/i, // U13, U 16
  /^[a-g]-?jugend$/i, // A-Jugend, Bjugend
  /^(jugend|junioren|juniorinnen|bambini|minis|senioren|herren|damen|frauen|maenner|männer)$/i,
];

const SIGNIFICANT_TOKEN_MIN = 4;

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function eqCI(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Drop trailing age-group tokens (repeatedly), keeping numbers and codes. */
export function stripAgeGroupSuffix(value: string): string {
  let tokens = norm(value).split(" ").filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (AGE_SUFFIX_PATTERNS.some((pattern) => pattern.test(last))) {
      tokens = tokens.slice(0, -1);
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

function significantTokens(value: string): string[] {
  return norm(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .split(/[\s/]+/)
    .filter((token) => token.length >= SIGNIFICANT_TOKEN_MIN);
}

function sharesSignificantToken(a: string, b: string): boolean {
  const left = new Set(significantTokens(a));
  for (const token of significantTokens(b)) {
    if (left.has(token)) {
      return true;
    }
  }
  return false;
}

/**
 * The single, canonical display name for a team.
 * Pure: never mutates inputs, never merges teams.
 */
export function deriveTeamDisplayName(input: TeamDisplayNameInput): string {
  const override = norm(input.override);
  if (override) {
    return override;
  }

  const club = norm(input.clubName);
  const team = norm(input.teamName);

  if (!team) {
    return club || "Team";
  }

  const teamClean = stripAgeGroupSuffix(team) || team;

  if (!club) {
    return teamClean;
  }
  // Team is exactly the club (after dropping an age suffix) → show the club once.
  if (eqCI(teamClean, club)) {
    return club;
  }
  // Team carries the club plus a distinguisher ("VfL Kirchheim 1"), or a concise
  // variant that still shares the club's key tokens ("SGM …/Grafenberg").
  if (sharesSignificantToken(teamClean, club)) {
    return teamClean;
  }
  // Team is a lossy acronym etc. → the full club name is clearer.
  return club;
}

/**
 * Whether two values describe the SAME display but must still be kept distinct
 * because their identities differ. Callers use this to warn, never to merge.
 */
export function displayNamesCollide(a: TeamDisplayNameInput, b: TeamDisplayNameInput): boolean {
  return eqCI(deriveTeamDisplayName(a), deriveTeamDisplayName(b));
}
