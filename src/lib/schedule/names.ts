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

function normalizeLabelPart(value: string | null | undefined) {
  return value?.trim() ?? "";
}

/**
 * Public club/team display label.
 * Identical club and team names (trim + case-insensitive) are shown once.
 */
export function publicTeamLabel(
  clubName: string | null | undefined,
  teamName: string | null | undefined,
) {
  const club = normalizeLabelPart(clubName);
  const team = normalizeLabelPart(teamName);

  if (club && team) {
    if (club.toLowerCase() === team.toLowerCase()) {
      return club;
    }
    return `${club} · ${team}`;
  }

  return club || team || "Team";
}

/** True when club and team should be shown as two distinct lines/parts. */
export function hasDistinctTeamName(
  clubName: string | null | undefined,
  teamName: string | null | undefined,
) {
  const club = normalizeLabelPart(clubName);
  const team = normalizeLabelPart(teamName);
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
