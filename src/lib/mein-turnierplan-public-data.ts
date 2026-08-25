import { cache } from "react";
import {
  fetchMeinTurnierplanJsonPublic,
  type MeinTurnierplanConnectionError,
} from "@/lib/mein-turnierplan-api";
import {
  normalizeMeinTurnierplanResponse,
  type NormalizedMeinTurnierplanGroup,
} from "@/lib/mein-turnierplan-normalize";
import {
  resolvePublicMatchesWidgetUrl,
  resolvePublicTableWidgetUrl,
} from "@/lib/mein-turnierplan-live-render";
import {
  asLiveDataSource,
  resolvePublicMeinTurnierplanJsonQueryId,
  type MeinTurnierplanFields,
} from "@/lib/mein-turnierplan";

export type PublicMeinTurnierplanParticipant = {
  id: string;
  name: string;
  groupName: string | null;
};

export type PublicMeinTurnierplanData = {
  usesPublicSource: boolean;
  isHybrid: boolean;
  isMeinTurnierplanOnly: boolean;
  available: boolean;
  error: MeinTurnierplanConnectionError | null;
  tournamentName: string | null;
  participants: PublicMeinTurnierplanParticipant[];
  groups: NormalizedMeinTurnierplanGroup[];
  matchesWidgetUrl: string | null;
  tableWidgetUrl: string | null;
};

export function usesMeinTurnierplanPublicTabs(tournament: MeinTurnierplanFields) {
  if (!tournament.meinTurnierplanEnabled) {
    return false;
  }

  const source = asLiveDataSource(tournament.liveDataSource ?? "hub");
  return source === "mein-turnierplan" || source === "hybrid";
}

function emptyPublicMeinTurnierplanData(
  tournament: MeinTurnierplanFields,
): PublicMeinTurnierplanData {
  const source = asLiveDataSource(tournament.liveDataSource ?? "hub");
  return {
    usesPublicSource: usesMeinTurnierplanPublicTabs(tournament),
    isHybrid: source === "hybrid",
    isMeinTurnierplanOnly: source === "mein-turnierplan",
    available: false,
    error: null,
    tournamentName: null,
    participants: [],
    groups: [],
    matchesWidgetUrl: resolvePublicMatchesWidgetUrl(tournament),
    tableWidgetUrl: resolvePublicTableWidgetUrl(tournament),
  };
}

export function flattenPublicMeinTurnierplanParticipants(
  groups: NormalizedMeinTurnierplanGroup[],
): PublicMeinTurnierplanParticipant[] {
  return groups.flatMap((group) =>
    group.teams.map((team) => ({
      id: team.id,
      name: team.name,
      groupName: group.name,
    })),
  );
}

async function loadPublicMeinTurnierplanData(
  tournament: MeinTurnierplanFields,
): Promise<PublicMeinTurnierplanData> {
  const base = emptyPublicMeinTurnierplanData(tournament);

  if (!base.usesPublicSource) {
    return base;
  }

  const queryId = resolvePublicMeinTurnierplanJsonQueryId(tournament);
  if (!queryId) {
    return { ...base, error: "invalid-id" };
  }

  const result = await fetchMeinTurnierplanJsonPublic(queryId);
  if (!result.ok) {
    return { ...base, error: result.error };
  }

  const normalized = normalizeMeinTurnierplanResponse(result.data);
  if (!normalized.ok) {
    return {
      ...base,
      error: normalized.error,
      tournamentName: null,
    };
  }

  const groups = normalized.normalized.groups;
  return {
    ...base,
    available: true,
    error: null,
    tournamentName: normalized.normalized.tournamentName,
    groups,
    participants: flattenPublicMeinTurnierplanParticipants(groups),
  };
}

export const getPublicMeinTurnierplanData = cache(loadPublicMeinTurnierplanData);
