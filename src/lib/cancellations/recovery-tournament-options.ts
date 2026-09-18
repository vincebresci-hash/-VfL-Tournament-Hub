import "server-only";

import { isTournamentWithinGuestRecoveryWindow } from "@/lib/cancellations/recovery-tournament-window";
import { formatDateDe } from "@/lib/format";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GuestRecoveryTournamentOption = {
  id: string;
  label: string;
};

type RecoveryTournamentRow = {
  id: string;
  name: string;
  date: string;
};

function logRecoveryTournaments(outcome: string, detail?: string) {
  if (detail) {
    console.info(
      `[guest-cancellation-recovery-tournaments] ${outcome}: ${detail}`,
    );
    return;
  }

  console.info(`[guest-cancellation-recovery-tournaments] ${outcome}`);
}

/**
 * Server-only tournament metadata for /kontakt/absage.
 *
 * Aligns with C2A tournament-level recovery window (date + 30 days > now).
 * Includes non-public archive rows; does not gate on open-application flag.
 * Does not query guest submissions / participants / contacts.
 * Result is independent of any guest identity input.
 */
export async function listGuestCancellationRecoveryTournamentOptions(
  now = new Date(),
): Promise<GuestRecoveryTournamentOption[]> {
  let service;
  try {
    service = createServiceRoleClient();
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    const message = error instanceof Error ? error.message : "unknown";
    logRecoveryTournaments(
      "service_role_unavailable",
      `${name}: ${message}`,
    );
    return [];
  }

  const { data, error } = await service.rpc(
    "list_guest_cancellation_recovery_tournaments",
  );

  if (error) {
    const parts = [
      error.code ? `code=${error.code}` : null,
      error.message ? `message=${error.message}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
    ].filter(Boolean);
    logRecoveryTournaments("query_error", parts.join("; ") || "unknown");
    return [];
  }

  if (!data) {
    logRecoveryTournaments("empty_data_without_error");
    return [];
  }

  const rows = data as RecoveryTournamentRow[];
  return rows
    .filter((row) => isTournamentWithinGuestRecoveryWindow(row.date, now))
    .map((row) => ({
      id: row.id,
      label: `${row.name} · ${formatDateDe(row.date)}`,
    }));
}
