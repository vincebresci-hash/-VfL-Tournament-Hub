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
import {
  guestApplicationFieldSnapshot,
  optionalApplicationText,
} from "@/lib/applications/guest-application-fields";
import {
  MULTI_TEAM_APPLICATION_MAX,
  buildGuestMultiTeamNames,
  formatMultiTeamNamesForEmail,
} from "@/lib/applications/multi-team-names";
import {
  describeRpcUuidArrayShape,
  parseBatchApplicationIds,
} from "@/lib/applications/rpc-uuid-array";

export type SubmitApplicationResult = {
  error: string | null;
  applicationId?: string | null;
  applicationIds?: string[];
};

export async function submitTournamentApplicationAction(input: {
  tournamentSlug: string;
  teamId?: string | null;
  teamIds?: string[] | null;
  teamCount?: number | null;
  values: ApplicationFormValues;
}): Promise<SubmitApplicationResult> {
  if (isHoneypotFilled(input.values)) {
    return { error: "Die Bewerbung konnte nicht gespeichert werden." };
  }

  const earlyTeamIds = uniqueNonEmptyIds(input.teamIds);
  const valuesForValidation =
    earlyTeamIds.length >= 2
      ? {
          ...input.values,
          teamName: input.values.teamName.trim() || "Mannschaft",
          birthYear: input.values.birthYear.trim() || "2016",
          selfRatedStrength: input.values.selfRatedStrength || "3",
        }
      : input.values;

  const errors = validateApplicationForm(valuesForValidation);
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
  const isClubUser = Boolean(session && canAccessClub(session.user.role));
  const allowMultipleTeams = tournament.allowMultipleTeams === true;

  const distinctTeamIds = uniqueNonEmptyIds(input.teamIds);
  const requestedTeamCount = normalizeRequestedTeamCount(input.teamCount);

  // Crafted multi-team requests must not bypass a disabled flag.
  if (!allowMultipleTeams) {
    if (distinctTeamIds.length > 1 || (requestedTeamCount != null && requestedTeamCount > 1)) {
      return {
        error: "Mehrfachmeldungen sind für dieses Turnier nicht freigeschaltet.",
      };
    }
  }

  let result: SubmitApplicationResult;
  let emailTeamName = input.values.teamName.trim();

  if (allowMultipleTeams && isClubUser && distinctTeamIds.length >= 2) {
    if (distinctTeamIds.length > MULTI_TEAM_APPLICATION_MAX) {
      return { error: "Es können höchstens 3 Mannschaften gleichzeitig gemeldet werden." };
    }
    result = await submitClubMultiTeamApplication(
      tournament.id,
      distinctTeamIds,
      input.values,
    );
    if (!result.error && result.applicationIds?.length) {
      emailTeamName = formatMultiTeamNamesForEmail(
        await resolveTeamNamesForEmail(distinctTeamIds),
      );
    }
  } else if (
    allowMultipleTeams &&
    !isClubUser &&
    requestedTeamCount != null &&
    requestedTeamCount >= 2
  ) {
    if (requestedTeamCount > MULTI_TEAM_APPLICATION_MAX) {
      return { error: "Es können höchstens 3 Mannschaften gleichzeitig gemeldet werden." };
    }
    const teamNames = buildGuestMultiTeamNames(
      input.values.teamName,
      requestedTeamCount,
    );
    result = await submitGuestMultiTeamApplication(tournament.id, input.values, teamNames);
    emailTeamName = formatMultiTeamNamesForEmail(teamNames);
  } else {
    // OFF path and ON+1: exact existing single-application semantics.
    result = isClubUser
      ? await submitClubApplication(
          {
            tournamentSlug: input.tournamentSlug,
            teamId: distinctTeamIds[0] ?? input.teamId ?? null,
            values: input.values,
          },
          tournament.id,
        )
      : await submitGuestApplication(
          {
            tournamentSlug: input.tournamentSlug,
            teamId: null,
            values: input.values,
          },
          tournament.id,
        );
  }

  if (result.error) {
    return result;
  }

  const confirmationApplicationId =
    result.applicationId ?? result.applicationIds?.[0] ?? null;

  if (settings.applicationConfirmationEnabled && confirmationApplicationId) {
    try {
      await sendApplicationReceivedEmail({
        applicationId: confirmationApplicationId,
        contactEmail: input.values.contactEmail,
        contactFirstName: input.values.contactFirstName,
        clubName: input.values.clubName,
        teamName: emailTeamName || input.values.teamName,
        tournament,
      });
    } catch (error) {
      console.error(
        "sendApplicationReceivedEmail failed",
        error instanceof Error ? error.message : error,
      );
    }
  }

  revalidatePath("/verein/bewerbungen");
  revalidatePath("/verein/dashboard");
  revalidatePath("/verein/teams");
  revalidatePath("/admin/bewerbungen");
  revalidatePath("/admin");
  return {
    error: null,
    applicationId: confirmationApplicationId,
    applicationIds: result.applicationIds,
  };
}

function uniqueNonEmptyIds(ids: string[] | null | undefined): string[] {
  if (!ids?.length) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function normalizeRequestedTeamCount(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    return null;
  }
  return value;
}

async function resolveTeamNamesForEmail(teamIds: string[]): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  const byId = new Map(
    ((data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );

  return teamIds.map((id) => byId.get(id)?.trim() || "Mannschaft");
}

async function submitClubMultiTeamApplication(
  tournamentId: string,
  teamIds: string[],
  values: ApplicationFormValues,
): Promise<SubmitApplicationResult> {
  const ensured = await ensureClubForCurrentUser();
  if (ensured.error === "database-missing") {
    return { error: toUserFacingDbError("Speichern nicht möglich.") };
  }

  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role) || !session.user.clubId) {
    return { error: "Dein Verein konnte nicht zugeordnet werden." };
  }

  const snapshot = applicationSnapshot(values);
  const payload: Json = { ...snapshot };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_club_applications", {
    p_tournament_id: tournamentId,
    p_team_ids: teamIds,
    p_payload: payload,
  });

  if (error) {
    console.error("create_club_applications failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (isDuplicateTeamApplicationViolation(error)) {
      return { error: DUPLICATE_TEAM_APPLICATION_MESSAGE };
    }
    return {
      error: toUserFacingDbError(
        error?.message?.includes("bereits")
          ? DUPLICATE_TEAM_APPLICATION_MESSAGE
          : "Die Bewerbung konnte nicht gespeichert werden.",
        error,
      ),
    };
  }

  const parsed = parseBatchApplicationIds(data, teamIds.length);
  if (!parsed.ok) {
    console.error("create_club_applications unexpected result shape", {
      reason: parsed.reason,
      expectedCount: teamIds.length,
      ...describeRpcUuidArrayShape(data),
    });
    return { error: "Die Bewerbung konnte nicht gespeichert werden." };
  }
  const applicationIds = parsed.ids;

  if (values.contactPhone.trim()) {
    await supabase
      .from("clubs")
      .update({ contact_phone: values.contactPhone.trim() })
      .eq("id", session.user.clubId);
  }

  return {
    error: null,
    applicationId: applicationIds[0],
    applicationIds,
  };
}

async function submitGuestMultiTeamApplication(
  tournamentId: string,
  values: ApplicationFormValues,
  teamNames: string[],
): Promise<SubmitApplicationResult> {
  const snapshot = applicationSnapshot(values);
  const payload: Json = {
    tournament_id: tournamentId,
    ...snapshot,
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_guest_applications", {
    p_payload: payload,
    p_team_names: teamNames,
  });

  if (error) {
    console.error("create_guest_applications failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return {
      error: toUserFacingDbError(
        "Die Bewerbung konnte nicht gespeichert werden.",
        error,
      ),
    };
  }

  const parsed = parseBatchApplicationIds(data, teamNames.length);
  if (!parsed.ok) {
    console.error("create_guest_applications unexpected result shape", {
      reason: parsed.reason,
      expectedCount: teamNames.length,
      ...describeRpcUuidArrayShape(data),
    });
    return { error: "Die Bewerbung konnte nicht gespeichert werden." };
  }
  const applicationIds = parsed.ids;

  return {
    error: null,
    applicationId: applicationIds[0],
    applicationIds,
  };
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
    league: optionalApplicationText(values.league),
    division: values.division.trim() || null,
    self_rated_strength: Number(values.selfRatedStrength),
    team_description: values.teamDescription.trim() || null,
    contact_first_name: values.contactFirstName.trim(),
    contact_last_name: values.contactLastName.trim(),
    contact_role: values.contactRole.trim(),
    contact_email: values.contactEmail.trim(),
    contact_phone: optionalApplicationText(values.contactPhone),
    staff_count: values.staffCount.trim() ? Number(values.staffCount) : null,
    notes: values.notes.trim() || null,
    ...guestApplicationFieldSnapshot(values),
  };
}
