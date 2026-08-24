import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { listTournamentOccupancy, getTournamentOccupancy } from "@/lib/db/queries";
import {
  FEATURED_TOURNAMENT_LIMIT,
  getFeaturedFromList,
  getTournamentSelect,
  TOURNAMENT_SELECT_TIERS,
  toPublicTournament,
  toTournamentFromRow,
} from "@/lib/tournaments";
import type { TournamentRow } from "@/lib/supabase/database";
import type { PublicTournament, Tournament } from "@/types/tournament";

async function fetchTournamentRows(options?: {
  slug?: string;
  id?: string;
  includeArchived?: boolean;
}) {
  const supabase = await createClient();

  for (const tier of TOURNAMENT_SELECT_TIERS) {
    let query = supabase.from("tournaments").select(getTournamentSelect(tier));

    if (options?.slug) {
      query = query.eq("slug", options.slug);
    }

    if (options?.id) {
      query = query.eq("id", options.id);
    }

    if (!options?.includeArchived && tier !== "basic") {
      query = query.is("archived_at", null);
    }

    const result = await query.order("date", { ascending: true });
    if (!result.error) {
      return (result.data ?? []) as unknown as TournamentRow[];
    }

    if (!isMissingRelationError(result.error)) {
      return [];
    }
  }

  return [];
}

export async function listPublicTournaments(): Promise<PublicTournament[]> {
  const [rows, occupancy] = await Promise.all([
    fetchTournamentRows({ includeArchived: false }),
    listTournamentOccupancy(),
  ]);
  const occupancyBySlug = new Map(occupancy.map((item) => [item.slug, item]));

  return rows.map((row) => {
    const item = occupancyBySlug.get(row.slug);
    return toPublicTournament(
      toTournamentFromRow(row, {
        confirmedTeams: item?.confirmedTeams,
        waitlistCount: item?.waitingListCount,
        applicationsCount:
          item == null
            ? 0
            : item.confirmedTeams +
              item.waitingListCount +
              item.underReviewCount +
              item.newCount,
      }),
    );
  });
}

export async function getPublicTournamentBySlug(
  slug: string,
): Promise<PublicTournament | null> {
  const [rows, occupancy] = await Promise.all([
    fetchTournamentRows({ slug, includeArchived: false }),
    getTournamentOccupancy(slug),
  ]);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return toPublicTournament(
    toTournamentFromRow(row, {
      confirmedTeams: occupancy?.confirmedTeams,
      waitlistCount: occupancy?.waitingListCount,
      applicationsCount:
        occupancy == null
          ? 0
          : occupancy.confirmedTeams +
            occupancy.waitingListCount +
            occupancy.underReviewCount +
            occupancy.newCount,
    }),
  );
}

export async function getTournamentBySlugOrId(
  value: string,
): Promise<Tournament | null> {
  const bySlug = await fetchTournamentRows({ slug: value, includeArchived: true });
  if (bySlug[0]) {
    return toTournamentFromRow(bySlug[0]);
  }

  const byId = await fetchTournamentRows({ id: value, includeArchived: true });
  if (byId[0]) {
    return toTournamentFromRow(byId[0]);
  }

  return null;
}

export async function getFeaturedTournaments(
  limit = FEATURED_TOURNAMENT_LIMIT,
): Promise<PublicTournament[]> {
  const tournaments = await listPublicTournaments();
  return getFeaturedFromList(tournaments, limit);
}
