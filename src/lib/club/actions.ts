"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { requirePermission } from "@/lib/auth/guards";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessClub } from "@/lib/auth/roles";
import { toUserFacingDbError } from "@/lib/db/errors";
import { AGE_GROUPS } from "@/types/tournament";
import { TEAM_STRENGTHS } from "@/types/application";
import type { AgeGroup } from "@/types/tournament";
import type { TeamStrength } from "@/types/application";

export type ClubActionResult = {
  error: string | null;
};

async function requireClubId() {
  const ensured = await ensureClubForCurrentUser();
  if (ensured.error === "database-missing") {
    return { clubId: null, error: toUserFacingDbError("Speichern nicht möglich.") };
  }

  if (typeof ensured.error === "string" && ensured.error !== "not-authenticated") {
    return { clubId: null, error: ensured.error };
  }

  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role) || !session.user.clubId) {
    return { clubId: null, error: "Bitte zuerst anmelden." };
  }

  return { clubId: session.user.clubId, error: null };
}

async function requireClubTeamManage() {
  const access = await requireClubId();
  if (access.error || !access.clubId) {
    return access;
  }

  const permission = await requirePermission("teams.manage", { clubId: access.clubId });
  if ("error" in permission && permission.error) {
    return { clubId: null, error: permission.error };
  }

  return { clubId: access.clubId, error: null };
}

export async function createClubTeamAction(input: {
  name: string;
  ageGroup: string;
  birthYear: number;
  league: string;
  division?: string;
  strength: number;
  coach: string;
}): Promise<ClubActionResult> {
  const access = await requireClubTeamManage();
  if (access.error || !access.clubId) {
    return { error: access.error ?? "Bitte zuerst anmelden." };
  }

  if (!AGE_GROUPS.includes(input.ageGroup as AgeGroup)) {
    return { error: "Bitte eine gültige Altersklasse wählen." };
  }

  if (!TEAM_STRENGTHS.includes(input.strength as TeamStrength)) {
    return { error: "Bitte eine gültige Spielstärke wählen." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({
    club_id: access.clubId,
    name: input.name.trim(),
    age_group: input.ageGroup,
    birth_year: input.birthYear,
    league: input.league.trim(),
    division: input.division?.trim() || null,
    self_rated_strength: input.strength,
    trainer_name: input.coach.trim(),
  });

  if (error) {
    return {
      error: toUserFacingDbError("Das Team konnte nicht gespeichert werden.", error),
    };
  }

  revalidatePath("/verein/teams");
  revalidatePath("/verein/dashboard");
  return { error: null };
}

export async function deleteClubTeamAction(teamId: string): Promise<ClubActionResult> {
  const access = await requireClubTeamManage();
  if (access.error || !access.clubId) {
    return { error: access.error ?? "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .eq("club_id", access.clubId);

  if (error) {
    return {
      error: toUserFacingDbError(
        "Das Team konnte nicht gelöscht werden. Prüfe, ob noch Bewerbungen existieren.",
        error,
      ),
    };
  }

  revalidatePath("/verein/teams");
  return { error: null };
}

export async function updateClubProfileAction(input: {
  name: string;
  city: string;
  website: string;
  contactPhone: string;
}): Promise<ClubActionResult> {
  const access = await requireClubId();
  if (access.error || !access.clubId) {
    return { error: access.error ?? "Bitte zuerst anmelden." };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "Bitte den Vereinsnamen angeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clubs")
    .update({
      name,
      city: input.city.trim() || null,
      website: input.website.trim() || null,
      contact_phone: input.contactPhone.trim() || null,
    })
    .eq("id", access.clubId);

  if (error) {
    return {
      error: toUserFacingDbError("Das Vereinsprofil konnte nicht gespeichert werden.", error),
    };
  }

  revalidatePath("/verein/profil");
  revalidatePath("/verein/dashboard");
  return { error: null };
}
