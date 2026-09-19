"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTournamentsManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value.trim());
}

function mapAssignmentRpcError(message: string): string | null {
  if (message.includes("Nicht autorisiert.")) {
    return "Nicht autorisiert.";
  }
  if (message.includes("Ungültiger Partner.")) {
    return "Ungültiger Partner.";
  }
  if (message.includes("Inaktive Partner können nicht neu zugeordnet werden.")) {
    return "Inaktive Partner können nicht neu zugeordnet werden.";
  }
  if (message.includes("Turnier fehlt.") || message.includes("Turnier nicht gefunden.")) {
    return "Turnier nicht gefunden.";
  }
  return null;
}

/**
 * Phase 2B-B: replace-set tournament ↔ partner assignments via verified RPC.
 * Authorization: tournaments.manage only (Partner Management permission is not used).
 */
export async function setTournamentPartnerAssignmentsAction(
  tournamentId: string,
  partnerIds: string[],
): Promise<{ error: string | null }> {
  const access = await requireTournamentsManage();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const id = typeof tournamentId === "string" ? tournamentId.trim() : "";
  if (!id || !isUuid(id)) {
    return { error: "Ungültiges Turnier." };
  }

  if (!Array.isArray(partnerIds)) {
    return { error: "Ungültige Partner-Auswahl." };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of partnerIds) {
    if (typeof raw !== "string") {
      return { error: "Ungültige Partner-Auswahl." };
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (!isUuid(value)) {
      return { error: "Ungültige Partner-Auswahl." };
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_tournament_partner_assignments", {
    p_tournament_id: id,
    p_partner_ids: normalized,
  });

  if (error) {
    const mapped = mapAssignmentRpcError(error.message ?? "");
    return {
      error:
        mapped ??
        toUserFacingDbError(
          "Die Partner-Zuordnung konnte nicht gespeichert werden.",
          error,
        ),
    };
  }

  revalidatePath(`/admin/turniere/${id}`);
  revalidatePath(`/admin/turniere/${id}/bearbeiten`);
  revalidatePath("/admin/turniere");

  return { error: null };
}
