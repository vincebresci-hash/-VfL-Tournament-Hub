"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureClubForCurrentUser } from "@/lib/auth/actions";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessClub } from "@/lib/auth/roles";
import { getTournamentIdBySlug } from "@/lib/db/queries";
import { getPublicTournamentBySlug } from "@/lib/tournaments";
import { getAppSettings } from "@/lib/settings";
import { toUserFacingDbError } from "@/lib/db/errors";
import { checkRateLimit } from "@/lib/applications/rate-limit";
import { sendApplicationReceivedEmail } from "@/lib/email/applications";
import {
  validateApplicationForm,
  type ApplicationFormValues,
} from "@/lib/application";
import { AGE_GROUPS } from "@/types/tournament";
import type { AgeGroup } from "@/types/tournament";
import type { Database } from "@/lib/supabase/database";

export type SubmitApplicationResult = {
  error: string | null;
};

type ApplicationClient = SupabaseClient<Database>;

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Turnierbewerbung absenden.
 *
 * Funktioniert sowohl für Gäste (ohne Login) als auch für eingeloggte
 * Vereinsnutzer. Für Gäste werden club_id / team_id / submitted_by NICHT
 * gesetzt; die Bewerbungsdaten werden als Snapshot direkt in `applications`
 * gespeichert. Für eingeloggte Vereine werden zusätzlich Club- und
 * Team-Datensätze verknüpft.
 */
export async function submitTournamentApplicationAction(input: {
  tournamentSlug: string;
  teamId?: string | null;
  honeypot?: string | null;
  values: ApplicationFormValues;
}): Promise<SubmitApplicationResult> {
  // Spam-Schutz: Bots füllen das versteckte Honeypot-Feld. Wir tun so, als sei
  // alles in Ordnung, speichern aber nichts.
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return { error: null };
  }

  // Serverseitige Validierung — niemals ausschließlich dem Client vertrauen.
  const errors = validateApplicationForm(input.values);
  if (Object.keys(errors).length > 0) {
    return { error: "Bitte prüfe die markierten Felder." };
  }

  // Grundlegender Rate-Limit-Schutz (pro IP und pro Kontakt-E-Mail).
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for") ?? "";
  const ip =
    forwardedFor.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown";
  const emailKey = input.values.contactEmail.trim().toLowerCase();

  const ipLimit = checkRateLimit(`apply:ip:${ip}`, {
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  const emailLimit = checkRateLimit(`apply:email:${emailKey}`, {
    limit: 4,
    windowMs: 10 * 60 * 1000,
  });

  if (!ipLimit.allowed || !emailLimit.allowed) {
    return {
      error:
        "Zu viele Bewerbungen in kurzer Zeit. Bitte versuche es in einigen Minuten erneut.",
    };
  }

  const settings = await getAppSettings();
  if (!settings.applicationsEnabled) {
    return { error: "Bewerbungen sind derzeit deaktiviert." };
  }

  const tournamentId = await getTournamentIdBySlug(input.tournamentSlug);
  if (!tournamentId) {
    return {
      error:
        "Das Turnier wurde in der Datenbank nicht gefunden. Bitte zuerst die SQL-Migration ausführen.",
    };
  }

  const supabase = await createClient();
  const values = input.values;
  const ageGroup = AGE_GROUPS.includes(values.ageGroup as AgeGroup)
    ? (values.ageGroup as AgeGroup)
    : null;

  const session = await getAuthSession();
  const isClubUser = Boolean(session && canAccessClub(session.user.role));

  let clubId: string | null = null;
  let teamId: string | null = null;
  let submittedBy: string | null = null;

  if (isClubUser && session) {
    const ensured = await ensureClubForCurrentUser();
    if (ensured.error === "database-missing") {
      return { error: toUserFacingDbError("Speichern nicht möglich.") };
    }

    const freshSession = await getAuthSession();
    clubId = freshSession?.user.clubId ?? ensured.clubId ?? null;
    submittedBy = freshSession?.user.id ?? session.user.id;

    if (clubId) {
      const resolved = await resolveClubTeam(
        supabase,
        clubId,
        input.teamId ?? null,
        values,
        ageGroup,
      );

      if (resolved.error) {
        return { error: resolved.error };
      }

      teamId = resolved.teamId;
    }
  }

  const snapshot = {
    tournament_id: tournamentId,
    club_id: clubId,
    team_id: teamId,
    submitted_by: submittedBy,
    club_name: values.clubName.trim(),
    club_city: values.clubCity.trim(),
    website: optional(values.website),
    team_name: values.teamName.trim(),
    age_group: ageGroup,
    birth_year: Number.isInteger(Number(values.birthYear))
      ? Number(values.birthYear)
      : null,
    league: optional(values.league),
    division: optional(values.division),
    self_rated_strength: Number(values.selfRatedStrength),
    team_description: optional(values.teamDescription),
    club_type: optional(values.clubType),
    contact_first_name: values.contactFirstName.trim(),
    contact_last_name: values.contactLastName.trim(),
    contact_role: values.contactRole.trim(),
    contact_email: values.contactEmail.trim(),
    contact_phone: values.contactPhone.trim(),
    alternative_phone: optional(values.alternativePhone),
    staff_count: values.staffCount.trim() ? Number(values.staffCount) : null,
    notes: optional(values.notes),
    status: "new" as const,
  };

  const { error } = await supabase.from("applications").insert(snapshot);

  if (error) {
    return {
      error: toUserFacingDbError(
        "Die Bewerbung konnte nicht gespeichert werden.",
        error,
      ),
    };
  }

  // Kontakt-Telefon nur für eingeloggte Vereine ins Vereinsprofil übernehmen.
  if (clubId && values.contactPhone.trim()) {
    await supabase
      .from("clubs")
      .update({ contact_phone: values.contactPhone.trim() })
      .eq("id", clubId);
  }

  // Bestätigungsmail IMMER an die angegebene Kontakt-E-Mail. Ein fehlerhafter
  // oder noch nicht angebundener Versand darf die Bewerbung nicht blockieren.
  try {
    const tournamentName =
      getPublicTournamentBySlug(input.tournamentSlug)?.name ??
      input.tournamentSlug;
    await sendApplicationReceivedEmail({
      contactEmail: values.contactEmail.trim(),
      clubName: values.clubName.trim(),
      teamName: values.teamName.trim(),
      tournamentName,
    });
  } catch {
    // Versand still fehlschlagen lassen — Bewerbung ist bereits gespeichert.
  }

  revalidatePath("/verein/bewerbungen");
  revalidatePath("/verein/dashboard");
  revalidatePath("/verein/teams");
  revalidatePath("/admin/bewerbungen");
  revalidatePath("/admin");
  return { error: null };
}

/**
 * Für eingeloggte Vereine: vorhandenes Team verwenden, per Name finden oder
 * neu anlegen. Gäste durchlaufen diese Logik nicht.
 */
async function resolveClubTeam(
  supabase: ApplicationClient,
  clubId: string,
  requestedTeamId: string | null,
  values: ApplicationFormValues,
  ageGroup: AgeGroup | null,
): Promise<{ teamId: string | null; error: string | null }> {
  let teamId = requestedTeamId;

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
        age_group: ageGroup,
        birth_year: Number(values.birthYear),
        league: values.league.trim(),
        division: values.division.trim() || null,
        self_rated_strength: Number(values.selfRatedStrength),
        trainer_name:
          `${values.contactFirstName.trim()} ${values.contactLastName.trim()}`.trim(),
      })
      .select("id")
      .single();

    if (teamError || !createdTeam) {
      return {
        teamId: null,
        error: toUserFacingDbError(
          "Die Mannschaft konnte nicht gespeichert werden.",
          teamError,
        ),
      };
    }

    return { teamId: createdTeam.id, error: null };
  }

  await supabase
    .from("teams")
    .update({
      name: values.teamName.trim(),
      age_group: ageGroup,
      birth_year: Number(values.birthYear),
      league: values.league.trim(),
      division: values.division.trim() || null,
      self_rated_strength: Number(values.selfRatedStrength),
    })
    .eq("id", teamId)
    .eq("club_id", clubId);

  return { teamId, error: null };
}
