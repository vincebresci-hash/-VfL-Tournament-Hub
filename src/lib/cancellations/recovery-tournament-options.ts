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
  } catch {
    return [];
  }

  const { data, error } = await service
    .from("tournaments")
    .select("id, name, date")
    .order("date", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as RecoveryTournamentRow[])
    .filter((row) => isTournamentWithinGuestRecoveryWindow(row.date, now))
    .map((row) => ({
      id: row.id,
      label: `${row.name} · ${formatDateDe(row.date)}`,
    }));
}
