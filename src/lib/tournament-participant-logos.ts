export type ExternalTeamLogoCandidate = {
  id: string;
  displayName: string;
  clubName: string;
  clubId: string | null;
};

function normalizeClubName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Suggest related teams for logo apply.
 * Only exact club_id or exact normalized club name — no prefix heuristics.
 * Admin must still confirm/select before apply.
 */
export function suggestRelatedTeamsForLogoApply(input: {
  sourceTeamId: string;
  sourceClubId: string | null;
  sourceClubName: string;
  candidates: ExternalTeamLogoCandidate[];
}): ExternalTeamLogoCandidate[] {
  const sourceClubId = input.sourceClubId?.trim() || null;
  const sourceClubName = normalizeClubName(input.sourceClubName);

  return input.candidates.filter((candidate) => {
    if (candidate.id === input.sourceTeamId) {
      return false;
    }

    if (sourceClubId && candidate.clubId && candidate.clubId === sourceClubId) {
      return true;
    }

    if (sourceClubName && normalizeClubName(candidate.clubName) === sourceClubName) {
      return true;
    }

    return false;
  });
}

export type ExternalTeamLogoState = {
  clubId: string | null;
  logoUrl: string | null;
  logoManualOverride: boolean;
};

/** Clear only the custom/imported logo_url; keep optional hub club link. */
export function buildClearCustomLogoState(currentClubId: string | null): ExternalTeamLogoState {
  return {
    clubId: currentClubId?.trim() || null,
    logoUrl: null,
    logoManualOverride: true,
  };
}

/** Unlink hub club only; keep custom logo_url. */
export function buildUnlinkHubClubState(currentLogoUrl: string | null): ExternalTeamLogoState {
  return {
    clubId: null,
    logoUrl: currentLogoUrl?.trim() || null,
    logoManualOverride: true,
  };
}

export function buildManualLogoState(input: {
  clubId?: string | null;
  logoUrl?: string | null;
  clearLogo?: boolean;
  clearCustomLogoOnly?: boolean;
  unlinkHubClubOnly?: boolean;
}): ExternalTeamLogoState {
  if (input.clearCustomLogoOnly || input.clearLogo) {
    return buildClearCustomLogoState(input.clubId ?? null);
  }

  if (input.unlinkHubClubOnly) {
    return buildUnlinkHubClubState(input.logoUrl ?? null);
  }

  const clubId = input.clubId?.trim() || null;
  const logoUrl = input.logoUrl?.trim() || null;

  return {
    clubId,
    logoUrl,
    logoManualOverride: true,
  };
}

export function shouldSkipMeinTurnierplanLogoSync(logoManualOverride: boolean | null | undefined) {
  return Boolean(logoManualOverride);
}

export function selectTeamsForLogoApply(input: {
  sourceTeamId: string;
  selectedTeamIds: string[];
  availableTeamIds: string[];
}): { error: string | null; targetIds: string[] } {
  const available = new Set(input.availableTeamIds);
  if (!available.has(input.sourceTeamId)) {
    return { error: "Das Quell-Team wurde nicht gefunden.", targetIds: [] };
  }

  const uniqueSelected = [...new Set(input.selectedTeamIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueSelected.length === 0) {
    return { error: "Bitte mindestens ein Team auswählen.", targetIds: [] };
  }

  for (const id of uniqueSelected) {
    if (!available.has(id)) {
      return { error: "Ein ausgewähltes Team gehört nicht zu diesem Turnier.", targetIds: [] };
    }
  }

  const targetIds = [...new Set([input.sourceTeamId, ...uniqueSelected])];
  return { error: null, targetIds };
}

/** Apply only logo_url to targets — club_id is not required and not copied. */
export function buildApplyLogoUrlOnlyState(sourceLogoUrl: string | null): {
  error: string | null;
  logoUrl: string | null;
} {
  const logoUrl = sourceLogoUrl?.trim() || null;
  if (!logoUrl) {
    return {
      error: "Das Quell-Team hat kein eigenes Logo zum Übernehmen.",
      logoUrl: null,
    };
  }

  return { error: null, logoUrl };
}
