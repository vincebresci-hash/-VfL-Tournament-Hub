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
