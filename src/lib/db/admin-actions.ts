"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { listAdminApplications } from "@/lib/db/queries";
import { toUserFacingDbError } from "@/lib/db/errors";
import { APPLICATION_STATUSES, INTERNAL_CATEGORIES, TEAM_STRENGTHS } from "@/types/application";
import type {
  AdminApplication,
  ApplicationStatus,
  InternalCategory,
  TeamStrength,
} from "@/types/application";
import { EMAIL_TEMPLATE_TYPES, type AppSettings, type EmailTemplateInput } from "@/types/admin";
import { settingsToRows } from "@/lib/settings";

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
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  if (!APPLICATION_STATUSES.includes(status)) {
    return { error: "Ungültiger Status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({ status })
    .eq("id", applicationId);

  if (error) {
    return { error: toUserFacingDbError("Der Status konnte nicht geändert werden.", error) };
  }

  revalidatePath("/admin/bewerbungen");
  revalidatePath(`/admin/bewerbungen/${applicationId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
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
    !APPLICATION_STATUSES.includes(settings.defaultApplicationStatus)
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
