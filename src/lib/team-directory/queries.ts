import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { toTeamDirectoryEntry, toTeamDirectoryListItem } from "@/lib/team-directory/mappers";
import { buildDirectoryNormalization } from "@/lib/team-directory/normalize";
import type {
  TeamDirectoryApplicationHistory,
  TeamDirectoryDuplicateMatch,
  TeamDirectoryEntry,
  TeamDirectoryListItem,
} from "@/types/team-directory";

const ENTRY_SELECT = `
  id,
  club_name,
  team_name,
  age_group,
  contact_first_name,
  contact_last_name,
  contact_role,
  contact_email,
  contact_phone,
  website,
  league,
  birth_year,
  division,
  self_rated_strength,
  internal_category,
  internal_strength,
  internal_notes,
  source,
  source_application_id,
  club_id,
  team_id,
  archived_at,
  created_at,
  updated_at
`;

export async function listTeamDirectoryEntries(input?: {
  includeArchived?: boolean;
  query?: string;
  ageGroup?: string;
  hubFilter?: "all" | "hub" | "external";
  archivedFilter?: "active" | "archived" | "all";
}) {
  const supabase = await createClient();
  let query = supabase
    .from("team_directory_entries")
    .select(ENTRY_SELECT)
    .order("updated_at", { ascending: false });

  const archivedFilter = input?.archivedFilter ?? "active";
  if (archivedFilter === "active") {
    query = query.is("archived_at", null);
  } else if (archivedFilter === "archived") {
    query = query.not("archived_at", "is", null);
  }

  if (input?.ageGroup && input.ageGroup !== "all") {
    query = query.eq("age_group", input.ageGroup);
  }

  if (input?.hubFilter === "hub") {
    query = query.not("team_id", "is", null);
  } else if (input?.hubFilter === "external") {
    query = query.is("team_id", null);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error)) {
      return { entries: [] as TeamDirectoryListItem[], ready: false };
    }

    throw error;
  }

  const needle = input?.query?.trim().toLowerCase() ?? "";
  const entries = (data ?? [])
    .map((row) => toTeamDirectoryListItem(row))
    .filter((entry) => {
      if (!needle) {
        return true;
      }

      return [
        entry.clubName,
        entry.teamName,
        entry.ageGroup ?? "",
        entry.contactFirstName ?? "",
        entry.contactLastName ?? "",
        entry.contactEmail ?? "",
        entry.league ?? "",
        entry.internalCategory ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

  const enriched = await Promise.all(
    entries.map(async (entry) => {
      const history = await loadTeamDirectoryHistory(entry);
      const latest = history[0] ?? null;
      return {
        ...entry,
        lastParticipationAt: latest?.createdAt ?? null,
        lastTournamentName: latest?.tournamentName ?? null,
        applicationHistoryCount: history.length,
      } satisfies TeamDirectoryListItem;
    }),
  );

  return { entries: enriched, ready: true };
}

export async function getTeamDirectoryEntry(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory_entries")
    .select(ENTRY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }

    throw error;
  }

  return data ? toTeamDirectoryEntry(data) : null;
}

export async function findActiveTeamDirectoryEntryBySourceApplication(
  sourceApplicationId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory_entries")
    .select("id, club_name, team_name, age_group, contact_email, archived_at")
    .eq("source_application_id", sourceApplicationId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    clubName: data.club_name,
    teamName: data.team_name,
    ageGroup: data.age_group,
    contactEmail: data.contact_email,
    matchReason: "source_application" as const,
    archivedAt: data.archived_at,
  };
}

export async function findTeamDirectoryDuplicates(input: {
  clubName: string;
  teamName: string;
  ageGroup?: string | null;
  clubId?: string | null;
  teamId?: string | null;
  sourceApplicationId?: string | null;
  excludeId?: string;
}) {
  const supabase = await createClient();
  const normalized = buildDirectoryNormalization(input);
  const matches = new Map<string, TeamDirectoryDuplicateMatch>();

  const addMatch = (
    row: {
      id: string;
      club_name: string;
      team_name: string;
      age_group: string | null;
      contact_email: string | null;
      archived_at: string | null;
    },
    matchReason: TeamDirectoryDuplicateMatch["matchReason"],
  ) => {
    if (input.excludeId && row.id === input.excludeId) {
      return;
    }

    matches.set(row.id, {
      id: row.id,
      clubName: row.club_name,
      teamName: row.team_name,
      ageGroup: row.age_group,
      contactEmail: row.contact_email,
      matchReason,
      archivedAt: row.archived_at,
    });
  };

  if (input.sourceApplicationId) {
    const existingFromApplication = await findActiveTeamDirectoryEntryBySourceApplication(
      input.sourceApplicationId,
    );

    if (existingFromApplication && existingFromApplication.id !== input.excludeId) {
      matches.set(existingFromApplication.id, existingFromApplication);
    }
  }

  if (input.teamId) {
    const { data } = await supabase
      .from("team_directory_entries")
      .select("id, club_name, team_name, age_group, contact_email, archived_at")
      .eq("team_id", input.teamId)
      .is("archived_at", null);

    for (const row of data ?? []) {
      addMatch(row, "team_id");
    }
  }

  if (input.clubId) {
    const { data } = await supabase
      .from("team_directory_entries")
      .select("id, club_name, team_name, age_group, contact_email, archived_at")
      .eq("club_id", input.clubId)
      .eq("norm_team_name", normalized.normTeamName)
      .eq("norm_age_group", normalized.normAgeGroup)
      .is("archived_at", null);

    for (const row of data ?? []) {
      addMatch(row, "club_team_age");
    }
  }

  const { data: normalizedMatches } = await supabase
    .from("team_directory_entries")
    .select("id, club_name, team_name, age_group, contact_email, archived_at")
    .eq("norm_club_name", normalized.normClubName)
    .eq("norm_team_name", normalized.normTeamName)
    .eq("norm_age_group", normalized.normAgeGroup)
    .is("archived_at", null);

  for (const row of normalizedMatches ?? []) {
    addMatch(row, "normalized_identity");
  }

  return [...matches.values()];
}

export async function loadTeamDirectoryHistory(
  entry: Pick<TeamDirectoryEntry, "teamId" | "clubName" | "teamName" | "ageGroup">,
) {
  const supabase = await createClient();
  const normalized = buildDirectoryNormalization({
    clubName: entry.clubName,
    teamName: entry.teamName,
    ageGroup: entry.ageGroup,
  });

  let query = supabase
    .from("applications")
    .select(
      "id, tournament_id, status, payment_status, age_group, club_name, team_name, created_at, tournaments (name, slug, date)",
    )
    .order("created_at", { ascending: false });

  if (entry.teamId) {
    query = query.eq("team_id", entry.teamId);
  } else {
    query = query.is("team_id", null);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) {
      return [] as TeamDirectoryApplicationHistory[];
    }

    throw error;
  }

  return (data ?? [])
    .filter((row) => {
      if (entry.teamId) {
        return true;
      }

      const clubMatch = row.club_name?.trim().toLowerCase() === normalized.normClubName;
      const teamMatch = row.team_name?.trim().toLowerCase() === normalized.normTeamName;
      const ageMatch = (row.age_group?.trim().toLowerCase() ?? "") === normalized.normAgeGroup;

      return clubMatch && teamMatch && ageMatch;
    })
    .map((row) => {
      const tournament = Array.isArray(row.tournaments)
        ? row.tournaments[0]
        : row.tournaments;

      return {
        id: row.id,
        tournamentId: row.tournament_id,
        tournamentName: tournament?.name ?? "Turnier",
        tournamentSlug: tournament?.slug ?? "",
        tournamentDate: tournament?.date ?? null,
        status: row.status,
        paymentStatus: row.payment_status,
        ageGroup: row.age_group,
        createdAt: row.created_at,
      } satisfies TeamDirectoryApplicationHistory;
    });
}

export async function loadApplicationForTeamDirectory(applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, club_id, team_id, club_name, team_name, age_group, birth_year, league, division, website, self_rated_strength, contact_first_name, contact_last_name, contact_role, contact_email, contact_phone, notes",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}
