import { createClient } from "@/lib/supabase/server";

export type OwnTeamAssignment = {
  teamId: string;
  teamName: string;
  clubId: string;
  ageGroup: string | null;
  clubName: string | null;
};

function unwrapNamedClub(
  value: { name: string } | { name: string }[] | null | undefined,
): { name: string } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

/**
 * Structured team assignments for the signed-in user via rbac_user_team_assignments.
 * Relies on existing RLS (own rows readable by auth.uid()).
 */
export async function loadOwnTeamAssignments(userId: string): Promise<OwnTeamAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rbac_user_team_assignments")
    .select("team_id, teams(id, name, club_id, age_group, clubs(name))")
    .eq("user_id", userId);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => {
      const team = row.teams as {
        id?: string;
        name?: string;
        club_id?: string;
        age_group?: string | null;
        clubs?: { name: string } | { name: string }[] | null;
      } | null;
      const teamClub = team?.clubs ? unwrapNamedClub(team.clubs) : null;
      if (!team?.id || !team.name || !team.club_id) {
        return null;
      }
      return {
        teamId: team.id,
        teamName: team.name,
        clubId: team.club_id,
        ageGroup: team.age_group ?? null,
        clubName: teamClub?.name ?? null,
      } satisfies OwnTeamAssignment;
    })
    .filter((value): value is OwnTeamAssignment => value !== null);
}
