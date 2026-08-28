export const DUPLICATE_TEAM_APPLICATION_MESSAGE =
  "Diese Mannschaft wurde bereits für dieses Turnier angemeldet.";

const DUPLICATE_TEAM_APPLICATION_INDEX = "applications_tournament_team_unique_idx";

export function hasExistingTeamApplication(existingApplicationId: string | null | undefined) {
  return Boolean(existingApplicationId);
}

export function isDuplicateTeamApplicationViolation(
  error: { code?: string; message?: string; details?: string } | null | undefined,
) {
  if (!error || error.code !== "23505") {
    return false;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    haystack.includes(DUPLICATE_TEAM_APPLICATION_INDEX) ||
    haystack.includes("tournament_id") && haystack.includes("team_id")
  );
}

export function resolveDuplicateTeamApplicationResult(input: {
  existingApplicationId?: string | null;
  insertError?: { code?: string; message?: string; details?: string } | null;
}) {
  if (hasExistingTeamApplication(input.existingApplicationId)) {
    return {
      blocked: true,
      error: DUPLICATE_TEAM_APPLICATION_MESSAGE,
      applicationId: null,
    } as const;
  }

  if (isDuplicateTeamApplicationViolation(input.insertError)) {
    return {
      blocked: true,
      error: DUPLICATE_TEAM_APPLICATION_MESSAGE,
      applicationId: null,
    } as const;
  }

  return { blocked: false } as const;
}
