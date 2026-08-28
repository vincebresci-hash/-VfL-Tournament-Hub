"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessClub } from "@/lib/auth/roles";
import { getAppSettings } from "@/lib/settings";
import { toUserFacingDbError } from "@/lib/db/errors";
import { sendApplicationReceivedEmail } from "@/lib/email/received-mail";
import { getTournamentOccupancy } from "@/lib/db/queries";
import { getPublicTournamentBySlug } from "@/lib/db/tournament-queries";
import {
  isHoneypotFilled,
  validateApplicationForm,
  type ApplicationFormValues,
} from "@/lib/application";
import { isPublicApplicationAllowed } from "@/lib/public-application-state";
import { AGE_GROUPS } from "@/types/tournament";
import type { AgeGroup } from "@/types/tournament";
import type { Json } from "@/lib/supabase/database";
import {
  DUPLICATE_TEAM_APPLICATION_MESSAGE,
  isDuplicateTeamApplicationViolation,
} from "@/lib/applications/duplicate-team-application";
import { guestApplicationFieldSnapshot } from "@/lib/applications/guest-application-fields";

export type SubmitApplicationResult = {
  error: string | null;
  applicationId?: string | null;
};

export async function submitTournamentApplicationAction(input: {
  tournamentSlug: string;
  teamId?: string | null;
  values: ApplicationFormValues;
}): Promise<SubmitApplicationResult> {
  if (isHoneypotFilled(input.values)) {
    return { error: "Die Bewerbung konnte nicht gespeichert werden." };
  }

  const errors = validateApplicationForm(input.values);
  if (Object.keys(errors).length > 0) {
    return { error: "Bitte prüfe die markierten Felder." };
  }

  const settings = await getAppSettings();
  if (!settings.applicationsEnabled) {
    return { error: "Bewerbungen sind derzeit deaktiviert." };
  }

  const tournament = await getPublicTournamentBySlug(input.tournamentSlug);
  const occupancy = tournament
    ? await getTournamentOccupancy(tournament.slug)
    : null;
  if (
    !tournament ||
    !isPublicApplicationAllowed({
      status: tournament.status,
      applicationsEnabled: settings.applicationsEnabled,
      applicationsOpen: tournament.applicationsOpen,
      archivedAt: tournament.archivedAt,
      availableSlots: occupancy?.availableSlots ?? tournament.availableSlots,
      waitlistEnabled: settings.waitlistEnabled && tournament.waitlistEnabled,
      isFull: occupancy?.isFull ?? tournament.isFull,
      applicationStart: tournament.applicationStart,
      applicationDeadline: tournament.applicationDeadline,
    })
  ) {
    return { error: "Bewerbungen für dieses Turnier sind derzeit nicht möglich." };
  }

  const session = await getAuthSession();
  const isClubUser = Boolean(
    session && canAccessClub(session.user.role),
  );

  const result = isClubUser
    ? await submitClubApplication(input, tournament.id)
    : await submitGuestApplication(input, tournament.id);

  if (result.error) {
    return result;
  }

  if (settings.applicationConfirmationEnabled && result.applicationId) {
    await sendApplicationReceivedEmail({
      applicationId: result.applicationId,
      contactEmail: input.values.contactEmail,
      contactFirstName: input.values.contactFirstName,
      clubName: input.values.clubName,
      teamName: input.values.teamName,
      tournament,
    });
  }

  revalidatePath("/verein/bewerbungen");
  revalidatePath("/verein/dashboard");
  revalidatePath("/verein/teams");
  revalidatePath("/admin/bewerbungen");
  revalidatePath("/admin");
  return { error: null, applicationId: result.applicationId };
}

async function submitClubApplication(
  input: {
    tournamentSlug: string;
    teamId?: string | null;
    values: ApplicationFormValues;
  },
  tournamentId: string,
): Promise<SubmitApplicationResult> {
  const ensured = await ensureClubForCurrentUser();
  if (ensured.error === "database-missing") {
    return { error: toUserFacingDbError("Speichern nicht möglich.") };
  }

  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role) || !session.user.clubId) {
    return { error: "Dein Verein konnte nicht zugeordnet werden." };
  }

  const clubId = session.user.clubId;
  const supabase = await createClient();
  const values = input.values;
  const snapshot = applicationSnapshot(values);
  let teamId = input.teamId ?? null;

  if (teamId) {
    const { data: existingTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!existingTeam) {
      teamId = null;
    }
  }

  if (!teamId) {
    const { data: matchedTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("club_id", clubId)
      .eq("name", values.teamName.trim())
      .maybeSingle();

    teamId = matchedTeam?.id ?? null;
  }

  if (!teamId) {
    const { data: createdTeam, error: teamError } = await supabase
      .from("teams")
      .insert({
        club_id: clubId,
        name: values.teamName.trim(),
        age_group: snapshot.age_group,
        birth_year: snapshot.birth_year,
        league: snapshot.league,
        division: snapshot.division,
        self_rated_strength: snapshot.self_rated_strength,
        trainer_name:
          `${values.contactFirstName.trim()} ${values.contactLastName.trim()}`.trim(),
      })
      .select("id")
      .single();

    if (teamError || !createdTeam) {
      return {
        error: toUserFacingDbError(
          "Die Mannschaft konnte nicht gespeichert werden.",
          teamError,
        ),
      };
    }

    teamId = createdTeam.id;
  } else {
    await supabase
      .from("teams")
      .update({
        name: values.teamName.trim(),
        age_group: snapshot.age_group,
        birth_year: snapshot.birth_year,
        league: snapshot.league,
        division: snapshot.division,
        self_rated_strength: snapshot.self_rated_strength,
      })
      .eq("id", teamId)
      .eq("club_id", clubId);
  }

  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (existingApplication) {
    return { error: DUPLICATE_TEAM_APPLICATION_MESSAGE };
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      tournament_id: tournamentId,
      club_id: clubId,
      team_id: teamId,
      submitted_by: session.user.id,
      status: "new",
      ...snapshot,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (isDuplicateTeamApplicationViolation(error)) {
      return { error: DUPLICATE_TEAM_APPLICATION_MESSAGE };
    }

    return {
      error: toUserFacingDbError("Die Bewerbung konnte nicht gespeichert werden.", error),
    };
  }

  if (values.contactPhone.trim()) {
    await supabase
      .from("clubs")
      .update({ contact_phone: values.contactPhone.trim() })
      .eq("id", clubId);
  }

  return { error: null, applicationId: data.id };
}

async function submitGuestApplication(
  input: {
    tournamentSlug: string;
    teamId?: string | null;
    values: ApplicationFormValues;
  },
  tournamentId: string,
): Promise<SubmitApplicationResult> {
  const supabase = await createClient();
  const snapshot = applicationSnapshot(input.values);
  const payload: Json = {
    tournament_id: tournamentId,
    ...snapshot,
  };

  const { data, error } = await supabase.rpc("create_guest_application", {
    p_payload: payload,
  });

  if (error || !data) {
    return {
      error: toUserFacingDbError(
        "Die Bewerbung konnte nicht gespeichert werden.",
        error,
      ),
    };
  }

  return { error: null, applicationId: data };
}

function applicationSnapshot(values: ApplicationFormValues) {
  const ageGroup = AGE_GROUPS.includes(values.ageGroup as AgeGroup)
    ? values.ageGroup
    : null;

  return {
    club_name: values.clubName.trim(),
    club_city: values.clubCity.trim(),
    team_name: values.teamName.trim(),
    age_group: ageGroup,
    birth_year: Number(values.birthYear),
    league: values.league.trim(),
    division: values.division.trim() || null,
    self_rated_strength: Number(values.selfRatedStrength),
    team_description: values.teamDescription.trim() || null,
    contact_first_name: values.contactFirstName.trim(),
    contact_last_name: values.contactLastName.trim(),
    contact_role: values.contactRole.trim(),
    contact_email: values.contactEmail.trim(),
    contact_phone: values.contactPhone.trim(),
    staff_count: values.staffCount.trim() ? Number(values.staffCount) : null,
    notes: values.notes.trim() || null,
    ...guestApplicationFieldSnapshot(values),
  };
}