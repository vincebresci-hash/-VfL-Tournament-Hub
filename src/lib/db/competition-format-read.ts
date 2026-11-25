/**
 * Narrow read of tournaments.competition_format.
 * A missing column is reported separately. Every other error stays an error.
 */

import { toUserFacingDbError } from "@/lib/db/errors";
import {
  isMissingCompetitionFormatColumnError,
  type CompetitionFormatReadResult,
} from "@/lib/schedule/competition-format-guard";
import { createClient } from "@/lib/supabase/server";

export async function readStoredCompetitionFormat(
  tournamentId: string,
): Promise<CompetitionFormatReadResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("competition_format")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    if (isMissingCompetitionFormatColumnError(error)) {
      return { status: "missing_column" };
    }
    return {
      status: "error",
      message: toUserFacingDbError("Die Wettbewerbskonfiguration konnte nicht gelesen werden.", error),
    };
  }
  if (!data) {
    return { status: "error", message: "Das Turnier wurde nicht gefunden." };
  }
  return { status: "ok", competitionFormat: data.competition_format ?? null };
}
