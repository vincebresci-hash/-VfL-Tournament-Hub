import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { toAdminApplication, toClubApplicationView, toClubTeam } from "@/lib/db/mappers";
import { getAvailableSlots, isTournamentFull, type TournamentOccupancy } from "@/lib/tournament-capacity";
import type { ApplicationWithRelations, TeamRow, TournamentOccupancyRow } from "@/lib/supabase/database";
import type { AdminApplication } from "@/types/application";
import type { ClubApplicationView } from "@/types/club";
import type { Team } from "@/types/auth";

const clubApplicationSelect = `
  *,
  clubs (id, name, city, website, contact_phone),
  teams (id, name, age_group, birth_year, league, division, self_rated_strength, trainer_name),
  tournaments (id, slug, name, age_group, date, location, status, max_teams)
`;

const adminApplicationSelect = `
  ${clubApplicationSelect},
  application_reviews (internal_category, internal_strength, internal_note, reviewed_by)
`;

export async function listClubTeams(clubId: string): Promise<Team[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    if (error && !isMissingRelationError(error)) {
      return [];
    }

    return [];
  }

  return (data as TeamRow[]).map(toClubTeam);
}

export async function listClubApplications(
  clubId: string,
): Promise<ClubApplicationView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(clubApplicationSelect)
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as unknown as ApplicationWithRelations[]).map(toClubApplicationView);
}

export async function getClubApplication(
  clubId: string,
  applicationId: string,
): Promise<ClubApplicationView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(clubApplicationSelect)
    .eq("club_id", clubId)
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toClubApplicationView(data as unknown as ApplicationWithRelations);
}

export async function listAdminApplications(): Promise<{
  applications: AdminApplication[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(adminApplicationSelect)
    .order("created_at", { ascending: false });

  if (error) {
    return { applications: [], ready: !isMissingRelationError(error) };
  }

  return {
    applications: (data as unknown as ApplicationWithRelations[]).map(toAdminApplication),
    ready: true,
  };
}

export async function getAdminApplication(
  applicationId: string,
): Promise<AdminApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(adminApplicationSelect)
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toAdminApplication(data as unknown as ApplicationWithRelations);
}

export async function getTournamentIdBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

export function mapTournamentOccupancy(
  row: TournamentOccupancyRow,
): TournamentOccupancy {
  const confirmedTeams = row.confirmed_teams;
  const availableSlots = getAvailableSlots(row.max_teams, confirmedTeams);

  return {
    slug: row.slug,
    maxTeams: row.max_teams,
    confirmedTeams,
    waitingListCount: row.waiting_list_count,
    underReviewCount: row.under_review_count,
    newCount: row.new_count,
    availableSlots: Number.isFinite(availableSlots) ? availableSlots : 0,
    isFull: isTournamentFull(row.max_teams, confirmedTeams),
  };
}

export async function listTournamentOccupancy(): Promise<TournamentOccupancy[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tournament_occupancy");

  if (error || !data) {
    return [];
  }

  const rows = Array.isArray(data) ? data : [data];
  return (rows as TournamentOccupancyRow[]).map(mapTournamentOccupancy);
}

export async function getTournamentOccupancy(
  slug: string,
): Promise<TournamentOccupancy | null> {
  const list = await listTournamentOccupancy();
  return list.find((item) => item.slug === slug) ?? null;
}

export async function isClubDatabaseReady() {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").select("id").limit(1);

  if (!error) {
    return true;
  }

  return !isMissingRelationError(error);
}
