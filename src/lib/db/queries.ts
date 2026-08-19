import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { toAdminApplication, toClubApplicationView, toClubTeam } from "@/lib/db/mappers";
import type { ApplicationWithRelations, TeamRow } from "@/lib/supabase/database";
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

export async function isClubDatabaseReady() {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").select("id").limit(1);

  if (!error) {
    return true;
  }

  return !isMissingRelationError(error);
}
