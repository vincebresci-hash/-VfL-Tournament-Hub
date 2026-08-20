import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { listTournamentOccupancy } from "@/lib/db/queries";
import {
  FEATURED_TOURNAMENT_LIMIT,
  getFeaturedFromList,
  getTournamentSelect,
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
  const run = async (full: boolean) => {
    let query = supabase.from("tournaments").select(getTournamentSelect(full));

    if (options?.slug) {
      query = query.eq("slug", options.slug);
    }

    if (options?.id) {
      query = query.eq("id", options.id);
    }

    if (!options?.includeArchived && full) {
      query = query.is("archived_at", null);
    }

    return query.order("date", { ascending: true });
  };

  const fullResult = await run(true);
  if (!fullResult.error) {
    return (fullResult.data ?? []) as unknown as TournamentRow[];
  }

  if (!isMissingRelationError(fullResult.error)) {
    return [];
  }

  const basicResult = await run(false);
  if (basicResult.error || !basicResult.data) {
    return [];
  }

  return basicResult.data as unknown as TournamentRow[];
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
  const rows = await fetchTournamentRows({ slug, includeArchived: false });
  const row = rows[0];
  if (!row) {
    return null;
  }

  return toPublicTournament(toTournamentFromRow(row));
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
