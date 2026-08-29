"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { listAdminApplications } from "@/lib/db/queries";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  APPLICATION_STATUSES,
  INTERNAL_CATEGORIES,
  TEAM_STRENGTHS,
  isManualAdminApplicationStatus,
  MANUAL_ADMIN_APPLICATION_STATUSES,
} from "@/types/application";
import type {
  AdminApplication,
  ApplicationStatus,
  InternalCategory,
  TeamStrength,
} from "@/types/application";
import { EMAIL_TEMPLATE_TYPES, type AppSettings, type EmailTemplateInput, type AdminTournamentInput } from "@/types/admin";
import { settingsToRows } from "@/lib/settings";
import { sendApplicationStatusEmail } from "@/lib/email/status-mail";
import { AGE_GROUPS, TOURNAMENT_STATUSES } from "@/types/tournament";
import { slugifyTournamentName } from "@/lib/tournaments";
import { validateMeinTurnierplanInput } from "@/lib/mein-turnierplan";
import { canAcceptApplicationIntoCapacity } from "@/lib/mein-turnierplan-participants";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

export async function loadAdminApplicationsAction(): Promise<{
  applications: AdminApplication[];
  ready: boolean;
  error: string | null;
}> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { applications: [], ready: false, error: access.error };
  }

  const result = await listAdminApplications();
  return { ...result, error: null };
}

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error, notice: null };
  }

  if (!APPLICATION_STATUSES.includes(status)) {
    return { error: "Ungültiger Status.", notice: null };
  }

  if (!isManualAdminApplicationStatus(status)) {
    return {
      error: "Absagen erfolgt ausschließlich über den Absage-Workflow.",
      notice: null,
    };
  }

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("applications")
    .select("id, status, tournament_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (currentError || !current) {
    return {
      error: toUserFacingDbError("Die Bewerbung wurde nicht gefunden.", currentError),
      notice: null,
    };
  }

  const previousStatus = current.status as ApplicationStatus;
  const statusChanged = previousStatus !== status;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, slug, max_teams")
    .eq("id", current.tournament_id)
    .maybeSingle();

  if (status === "accepted" && previousStatus !== "accepted") {
    if (tournament?.max_teams != null && tournament.max_teams >= 0) {
      const [acceptedAppsResult, externalTeamsResult] = await Promise.all([
        supabase
          .from("applications")
          .select("id")
          .eq("tournament_id", tournament.id)
          .eq("status", "accepted"),
        supabase
          .from("tournament_external_teams")
          .select("application_id, participation_status, external_active")
          .eq("tournament_id", tournament.id),
      ]);

      if (acceptedAppsResult.error || externalTeamsResult.error) {
        return {
          error: "Die Kapazität konnte nicht geprüft werden.",
          notice: null,
        };
      }

      const capacity = canAcceptApplicationIntoCapacity({
        maxTeams: tournament.max_teams,
        acceptedApplicationIds: (acceptedAppsResult.data ?? []).map((row) => String(row.id)),
        externalTeams: (externalTeamsResult.data ?? []).map((row) => ({
          participationStatus: String(row.participation_status ?? "detected"),
          externalActive: row.external_active !== false,
          applicationId: row.application_id ? String(row.application_id) : null,
        })),
        applicationIdToAccept: applicationId,
      });

      if (!capacity.ok) {
        return { error: capacity.error, notice: null };
      }
    }
  }

  if (statusChanged) {
    const { error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", applicationId);

    if (error) {
      return {
        error: toUserFacingDbError("Der Status konnte nicht geändert werden.", error),
        notice: null,
      };
    }
  }

  revalidatePath("/admin/bewerbungen");
  revalidatePath(`/admin/bewerbungen/${applicationId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath("/admin/emails");
  revalidatePath("/turniere");
  if (tournament?.slug) {
    revalidatePath(`/admin/turniere/${tournament.slug}`);
    revalidatePath(`/turniere/${tournament.slug}`);
  }

  if (!statusChanged) {
    return { error: null, notice: "Status gespeichert." };
  }

  const mail = await sendApplicationStatusEmail({
    applicationId,
    status,
    actorId: access.session.user.id,
  });

  if (mail.sent) {
    return { error: null, notice: "Status gespeichert und E-Mail versendet." };
  }

  if (mail.skipped) {
    return { error: null, notice: "Status gespeichert." };
  }

  return {
    error: null,
    notice: "Status gespeichert, E-Mail konnte jedoch nicht versendet werden.",
  };
}

export async function updateTournamentMaxTeamsAction(
  slug: string,
  maxTeams: number,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  if (!Number.isInteger(maxTeams) || maxTeams < 1 || maxTeams > 256) {
    return { error: "Bitte eine gültige Teilnehmerzahl angeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ max_teams: maxTeams })
    .eq("slug", slug);

  if (error) {
    return {
      error: toUserFacingDbError("Die Teilnehmerzahl konnte nicht gespeichert werden.", error),
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${slug}`);
  revalidatePath("/turniere");
  revalidatePath(`/turniere/${slug}`);
  return { error: null };
}

export async function upsertApplicationReviewAction(
  applicationId: string,
  update: {
    internalCategory?: InternalCategory | null;
    internalStrength?: TeamStrength | null;
    internalNotes?: string | null;
  },
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  if (
    update.internalCategory &&
    !INTERNAL_CATEGORIES.includes(update.internalCategory)
  ) {
    return { error: "Ungültige Kategorie." };
  }

  if (
    update.internalStrength &&
    !TEAM_STRENGTHS.includes(update.internalStrength)
  ) {
    return { error: "Ungültige Spielstärke." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("application_reviews")
    .select("id, internal_category, internal_strength, internal_note")
    .eq("application_id", applicationId)
    .maybeSingle();

  const next = {
    application_id: applicationId,
    internal_category:
      update.internalCategory === undefined
        ? existing?.internal_category ?? null
        : update.internalCategory,
    internal_strength:
      update.internalStrength === undefined
        ? existing?.internal_strength ?? null
        : update.internalStrength,
    internal_note:
      update.internalNotes === undefined
        ? existing?.internal_note ?? null
        : update.internalNotes,
    reviewed_by: access.session.user.id,
  };

  const { error } = await supabase
    .from("application_reviews")
    .upsert(next, { onConflict: "application_id" });

  if (error) {
    return {
      error: toUserFacingDbError("Die interne Bewertung konnte nicht gespeichert werden.", error),
    };
  }

  revalidatePath("/admin/bewerbungen");
  revalidatePath(`/admin/bewerbungen/${applicationId}`);
  revalidatePath("/admin/turniere");
  return { error: null };
}

function revalidateAdminAdminAreas() {
  revalidatePath("/admin");
  revalidatePath("/admin/vereine");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/emails");
  revalidatePath("/admin/einstellungen");
}

export async function createEmailTemplateAction(
  input: EmailTemplateInput,
): Promise<{ error: string | null; id?: string }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseEmailTemplateInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert(parsed.value)
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: toUserFacingDbError("Die Vorlage konnte nicht gespeichert werden.", error),
    };
  }

  revalidateAdminAdminAreas();
  revalidatePath(`/admin/emails/${data.id}`);
  return { error: null, id: data.id };
}

export async function updateEmailTemplateAction(
  id: string,
  input: EmailTemplateInput,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseEmailTemplateInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update(parsed.value)
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Die Vorlage konnte nicht gespeichert werden.", error),
    };
  }

  revalidateAdminAdminAreas();
  revalidatePath(`/admin/emails/${id}`);
  return { error: null };
}

export async function deleteEmailTemplateAction(
  id: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Die Vorlage konnte nicht gelöscht werden.", error),
    };
  }

  revalidateAdminAdminAreas();
  return { error: null };
}

export async function saveAppSettingsAction(
  settings: AppSettings,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  if (
    !MANUAL_ADMIN_APPLICATION_STATUSES.includes(settings.defaultApplicationStatus)
  ) {
    return { error: "Ungültiger Standardstatus." };
  }

  const supabase = await createClient();
  const rows = settingsToRows({
    ...settings,
    platformName: settings.platformName.trim(),
    organizerName: settings.organizerName.trim(),
    contactEmail: settings.contactEmail.trim(),
    contactPhone: settings.contactPhone.trim(),
  });

  for (const row of rows) {
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: row.key,
        value: row.value,
        description: row.description,
        updated_by: access.session.user.id,
      },
      { onConflict: "key" },
    );

    if (error) {
      return {
        error: toUserFacingDbError("Die Einstellungen konnten nicht gespeichert werden.", error),
      };
    }
  }

  revalidateAdminAdminAreas();
  revalidatePath("/turniere", "layout");
  return { error: null };
}

function revalidateTournamentPaths(slug?: string | null, id?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath("/turniere");
  revalidatePath("/", "layout");
  if (slug) {
    revalidatePath(`/admin/turniere/${slug}`);
    revalidatePath(`/turniere/${slug}`);
    revalidatePath(`/turniere/${slug}/bewerben`);
  }
  if (id) {
    revalidatePath(`/admin/turniere/${id}`);
    revalidatePath(`/admin/turniere/${id}/bearbeiten`);
    revalidatePath(`/admin/turniere/${id}/gruppen`);
    revalidatePath(`/admin/turniere/${id}/spielplan`);
    revalidatePath(`/admin/turniere/${id}/ergebnisse`);
    revalidatePath(`/admin/turniere/${id}/ko-runde`);
  }
}

function parseOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  return `${trimmed}:00`;
}

function parseOptionalDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }

  return trimmed;
}

function parseTournamentInput(input: AdminTournamentInput): {
  error: string | null;
  value: {
    name: string;
    slug: string;
    age_group: string;
    birth_year: number | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    address: string | null;
    short_description: string | null;
    description: string | null;
    max_teams: number;
    status: (typeof TOURNAMENT_STATUSES)[number];
    applications_open: boolean;
    waitlist_enabled: boolean;
    application_start: string | null;
    application_deadline: string | null;
    image_url: string | null;
    play_format: string | null;
    playing_time: string | null;
    pitch_format: string | null;
    entry_fee: string | null;
    travel_info: string | null;
    changing_rooms: string | null;
    catering: string | null;
    team_info: string | null;
    mein_turnierplan_url: string | null;
    mein_turnierplan_enabled: boolean;
    mein_turnierplan_label: string | null;
    mein_turnierplan_embed_url: string | null;
    live_data_source: string;
    mein_turnierplan_tournament_id: string | null;
    mein_turnierplan_matches_widget_url: string | null;
    mein_turnierplan_table_widget_url: string | null;
    public_schedule_note: string | null;
    public_live_note: string | null;
  } | null;
} {
  const name = input.name.trim();
  const slug = slugifyTournamentName(input.slug || input.name);
  const date = input.date.trim();
  const maxTeams = Number.parseInt(input.maxTeams, 10);
  const birthYearRaw = input.birthYear.trim();
  const birthYear = birthYearRaw ? Number.parseInt(birthYearRaw, 10) : null;

  if (!name) {
    return { error: "Bitte den Turniernamen angeben.", value: null };
  }

  if (!slug) {
    return { error: "Bitte einen gültigen Slug angeben.", value: null };
  }

  if (!AGE_GROUPS.includes(input.ageGroup as (typeof AGE_GROUPS)[number])) {
    return { error: "Bitte eine gültige Altersklasse wählen.", value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Bitte ein gültiges Datum angeben.", value: null };
  }

  if (!Number.isInteger(maxTeams) || maxTeams < 1 || maxTeams > 256) {
    return { error: "Bitte eine gültige Teilnehmerzahl zwischen 1 und 256 angeben.", value: null };
  }

  if (!TOURNAMENT_STATUSES.includes(input.status)) {
    return { error: "Bitte einen gültigen Turnierstatus wählen.", value: null };
  }

  if (birthYear != null && (!Number.isInteger(birthYear) || birthYear < 1990 || birthYear > 2040)) {
    return { error: "Bitte einen gültigen Jahrgang angeben.", value: null };
  }

  const meinTurnierplan = validateMeinTurnierplanInput({
    enabled: Boolean(input.meinTurnierplanEnabled),
    url: input.meinTurnierplanUrl,
    liveDataSource: input.liveDataSource,
    tournamentId: input.meinTurnierplanTournamentId,
    matchesWidgetUrl: input.meinTurnierplanMatchesWidgetUrl,
    tableWidgetUrl: input.meinTurnierplanTableWidgetUrl,
  });

  if (meinTurnierplan.error) {
    return { error: meinTurnierplan.error, value: null };
  }

  return {
    error: null,
    value: {
      name,
      slug,
      age_group: input.ageGroup,
      birth_year: birthYear,
      date,
      start_time: parseOptionalTime(input.startTime),
      end_time: parseOptionalTime(input.endTime),
      location: parseOptionalText(input.location),
      address: parseOptionalText(input.address),
      short_description: parseOptionalText(input.shortDescription),
      description: parseOptionalText(input.description),
      max_teams: maxTeams,
      status: input.status,
      applications_open: Boolean(input.applicationsOpen),
      waitlist_enabled: Boolean(input.waitlistEnabled),
      application_start: parseOptionalDateTime(input.applicationStart),
      application_deadline: parseOptionalDateTime(input.applicationDeadline),
      image_url: parseOptionalText(input.imageUrl),
      play_format: parseOptionalText(input.playFormat),
      playing_time: parseOptionalText(input.playingTime),
      pitch_format: parseOptionalText(input.pitchFormat),
      entry_fee: parseOptionalText(input.entryFee),
      travel_info: parseOptionalText(input.travelInfo),
      changing_rooms: parseOptionalText(input.changingRooms),
      catering: parseOptionalText(input.catering),
      team_info: parseOptionalText(input.teamInfo),
      mein_turnierplan_url: meinTurnierplan.url,
      mein_turnierplan_enabled: Boolean(input.meinTurnierplanEnabled),
      mein_turnierplan_label: parseOptionalText(input.meinTurnierplanLabel),
      mein_turnierplan_embed_url: null,
      live_data_source: meinTurnierplan.liveDataSource,
      mein_turnierplan_tournament_id: meinTurnierplan.tournamentId,
      mein_turnierplan_matches_widget_url: meinTurnierplan.matchesWidgetUrl,
      mein_turnierplan_table_widget_url: meinTurnierplan.tableWidgetUrl,
      public_schedule_note: parseOptionalText(input.publicScheduleNote),
      public_live_note: parseOptionalText(input.publicLiveNote),
    },
  };
}

export async function createTournamentAction(
  input: AdminTournamentInput,
): Promise<{ error: string | null; id?: string; slug?: string }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseTournamentInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .insert(parsed.value)
    .select("id, slug")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Dieser Slug ist bereits vergeben." };
    }

    return {
      error: toUserFacingDbError("Das Turnier konnte nicht erstellt werden.", error),
    };
  }

  revalidateTournamentPaths(data.slug, data.id);
  return { error: null, id: data.id, slug: data.slug };
}

export async function updateTournamentAction(
  id: string,
  input: AdminTournamentInput,
): Promise<{ error: string | null; slug?: string }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseTournamentInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .update(parsed.value)
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Dieser Slug ist bereits vergeben." };
    }

    return {
      error: toUserFacingDbError("Das Turnier konnte nicht gespeichert werden.", error),
    };
  }

  revalidateTournamentPaths(data.slug, data.id);
  return { error: null, slug: data.slug };
}

export async function archiveTournamentAction(
  id: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  const { error } = await supabase
    .from("tournaments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Das Turnier konnte nicht archiviert werden.", error),
    };
  }

  revalidateTournamentPaths(tournament.slug, tournament.id);
  return { error: null };
}

export async function restoreTournamentAction(
  id: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  const { error } = await supabase
    .from("tournaments")
    .update({ archived_at: null })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Das Turnier konnte nicht wiederhergestellt werden.", error),
    };
  }

  revalidateTournamentPaths(tournament.slug, tournament.id);
  return { error: null };
}

export async function deleteTournamentAction(
  id: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: tournament, error: loadError } = await supabase
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !tournament) {
    return {
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", loadError),
    };
  }

  const { count, error: countError } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id);

  if (countError) {
    return {
      error: toUserFacingDbError("Die Bewerbungen konnten nicht geprüft werden.", countError),
    };
  }

  if ((count ?? 0) > 0) {
    return {
      error:
        "Dieses Turnier hat bereits Bewerbungen und kann nicht gelöscht werden. Bitte archivieren.",
    };
  }

  const { error } = await supabase.from("tournaments").delete().eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Das Turnier konnte nicht gelöscht werden.", error),
    };
  }

  revalidateTournamentPaths(tournament.slug, tournament.id);
  return { error: null };
}

function parseEmailTemplateInput(input: EmailTemplateInput): {
  error: string | null;
  value: {
    name: string;
    subject: string;
    body: string;
    type: EmailTemplateInput["type"];
    active: boolean;
  } | null;
} {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!name || !subject || !body) {
    return { error: "Name, Betreff und Text sind erforderlich.", value: null };
  }

  if (!EMAIL_TEMPLATE_TYPES.includes(input.type)) {
    return { error: "Ungültiger Vorlagentyp.", value: null };
  }

  return {
    error: null,
    value: {
      name,
      subject,
      body,
      type: input.type,
      active: Boolean(input.active),
    },
  };
}
