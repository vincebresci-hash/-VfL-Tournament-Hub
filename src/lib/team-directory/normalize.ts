export function normalizeDirectoryText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase();
}

export function normalizeDirectoryEmail(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildDirectoryNormalization(input: {
  clubName: string;
  teamName: string;
  ageGroup?: string | null;
  contactEmail?: string | null;
}) {
  return {
    normClubName: normalizeDirectoryText(input.clubName),
    normTeamName: normalizeDirectoryText(input.teamName),
    normAgeGroup: normalizeDirectoryText(input.ageGroup),
    normContactEmail: normalizeDirectoryEmail(input.contactEmail),
  };
}
