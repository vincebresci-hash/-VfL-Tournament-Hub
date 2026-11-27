/**
 * Central, presentation-only team-name normalization.
 *
 * Stored club/team values are never changed. The helper only removes redundant
 * club repetitions and age-class markers while preserving real team
 * differentiators such as I/II, 1/2 or B2. An explicit manual override wins.
 */

export type TeamDisplayNameInput = {
  clubName?: string | null;
  teamName?: string | null;
  /** Explicit admin-maintained display name, if a caller actually has one. */
  override?: string | null;
};

const AGE_MARKER_PATTERNS: RegExp[] = [
  /^u\s?\d{1,2}$/i,
  /^[a-g]-?jugend$/i,
  /^(jugend|junioren|juniorinnen|bambini|minis|senioren|herren|damen|frauen|maenner|männer)$/i,
];

const TEAM_DESIGNATOR_PATTERN = /^(?:[ivx]{1,5}|\d{1,2}|[a-z]\d{1,2})$/i;
const SIGNIFICANT_TOKEN_MIN = 4;

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function eqCI(a: string, b: string): boolean {
  return a.localeCompare(b, "de", { sensitivity: "base" }) === 0;
}

function isAgeMarker(value: string): boolean {
  return AGE_MARKER_PATTERNS.some((pattern) => pattern.test(value));
}

function stripAgeMarkers(value: string): string {
  return norm(value)
    .split(" ")
    .filter((token) => !isAgeMarker(token))
    .join(" ");
}

/** Drop trailing age-class tokens while preserving team numbers/codes. */
export function stripAgeGroupSuffix(value: string): string {
  let tokens = norm(value).split(" ").filter(Boolean);
  while (tokens.length > 0 && isAgeMarker(tokens[tokens.length - 1] ?? "")) {
    tokens = tokens.slice(0, -1);
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
  return significantTokens(b).some((token) => left.has(token));
}

function redundantClubPrefixRemainder(team: string, club: string): string | null {
  const teamLower = team.toLocaleLowerCase("de");
  const clubLower = club.toLocaleLowerCase("de");
  if (teamLower === clubLower) return "";
  if (!teamLower.startsWith(`${clubLower} `)) return null;
  return norm(team.slice(club.length));
}

/** Pure display-name derivation; never mutates or persists source values. */
export function deriveTeamDisplayName(input: TeamDisplayNameInput): string {
  const override = norm(input.override);
  if (override) return override;

  const rawClub = norm(input.clubName);
  const rawTeam = norm(input.teamName);
  const club = stripAgeGroupSuffix(rawClub) || rawClub;

  if (!rawTeam) return club || "Team";

  const teamWithoutAge = stripAgeMarkers(rawTeam);
  if (!club) return teamWithoutAge || rawTeam;

  // A team value containing only the age class adds no useful identity.
  if (!teamWithoutAge) return club;

  // Preserve a short, meaningful team suffix entered separately (I, II, 1, B2).
  if (TEAM_DESIGNATOR_PATTERN.test(teamWithoutAge)) {
    return `${club} ${teamWithoutAge}`;
  }

  // Remove a duplicated club prefix, but retain a real suffix after it.
  const remainder = redundantClubPrefixRemainder(teamWithoutAge, club);
  if (remainder != null) {
    return remainder ? `${club} ${remainder}` : club;
  }

  if (eqCI(teamWithoutAge, club)) return club;

  // A concise real variant can stand on its own; a lossy acronym/age label cannot.
  if (sharesSignificantToken(teamWithoutAge, club)) return teamWithoutAge;
  return club;
}

export function displayNamesCollide(a: TeamDisplayNameInput, b: TeamDisplayNameInput): boolean {
  return eqCI(deriveTeamDisplayName(a), deriveTeamDisplayName(b));
}
