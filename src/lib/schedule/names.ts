import { deriveTeamDisplayName } from "@/lib/schedule/team-display-name";

export function groupDisplayName(index: number) {
  if (index < 26) {
    return `Gruppe ${String.fromCharCode(65 + index)}`;
  }

  const first = Math.floor(index / 26) - 1;
  const second = index % 26;
  return `Gruppe ${String.fromCharCode(65 + first)}${String.fromCharCode(65 + second)}`;
}

export function fieldDisplayName(index: number) {
  return `Feld ${index + 1}`;
}

/**
 * Compatibility entry point for all public views. The central presentation
 * helper removes redundant club/age text without changing stored values.
 */
export function publicTeamLabel(
  clubName: string | null | undefined,
  teamName: string | null | undefined,
) {
  return deriveTeamDisplayName({ clubName, teamName });
}

/** True when club and team should be shown as two distinct lines/parts. */
export function hasDistinctTeamName(
  clubName: string | null | undefined,
  teamName: string | null | undefined,
) {
  const club = clubName?.trim() ?? "";
  const team = teamName?.trim() ?? "";
  if (!club || !team) {
    return Boolean(team);
  }
  return club.toLowerCase() !== team.toLowerCase();
}

export function teamLabel(
  labels: Record<string, string>,
  applicationId: string | null | undefined,
  fallback = "steht noch nicht fest",
) {
  if (!applicationId) {
    return fallback;
  }

  return labels[applicationId] ?? fallback;
}
