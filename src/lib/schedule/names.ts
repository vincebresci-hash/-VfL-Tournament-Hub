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

export function publicTeamLabel(clubName: string, teamName: string) {
  const club = clubName.trim() || "Verein";
  const team = teamName.trim();
  return team ? `${club} · ${team}` : club;
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
