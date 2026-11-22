/**
 * Narrow read of the three competition columns.
 * A missing column stays a legacy fallback. Other errors stay errors.
 */

import { toUserFacingDbError } from "@/lib/db/errors";
import { isMissingCompetitionFormatColumnError } from "@/lib/schedule/competition-format-guard";
import type { CompetitionFormat } from "@/lib/schedule/competition-config";
import { createClient } from "@/lib/supabase/server";

export type StoredLeagueScheduleConfig =
  | { status: "missing_column" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      updatedAt: string;
      competitionFormat: CompetitionFormat | null;
      leagueMatchesPerTeam: number | null;
      knockoutCutoff: 4 | 8 | null;
    };

function missingCompetitionColumn(error: { code?: string; message?: string } | null) {
  if (isMissingCompetitionFormatColumnError(error)) {
    return true;
  }
  const message = (error?.message ?? "").toLowerCase();
  const mentionsColumn =
    message.includes("league_matches_per_team") || message.includes("knockout_cutoff");
  if (!mentionsColumn) {
    return false;
  }
  const code = error?.code ?? "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

export async function readStoredLeagueScheduleConfig(
  tournamentId: string,
): Promise<StoredLeagueScheduleConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("updated_at, competition_format, league_matches_per_team, knockout_cutoff")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    if (missingCompetitionColumn(error)) {
      return { status: "missing_column" };
    }
    return {
      status: "error",
      message: toUserFacingDbError("Die Wettbewerbskonfiguration konnte nicht gelesen werden.", error),
    };
  }
  if (!data) {
    return { status: "not_found" };
  }

  const format = data.competition_format ?? null;
  if (
    format != null &&
    format !== "round-robin" &&
    format !== "groups-knockout" &&
    format !== "champions-league"
  ) {
    return { status: "error", message: "Der gespeicherte Spielplanmodus ist ungültig." };
  }

  const cutoff = data.knockout_cutoff ?? null;
  return {
    status: "ok",
    updatedAt: data.updated_at,
    competitionFormat: format,
    leagueMatchesPerTeam: data.league_matches_per_team ?? null,
    knockoutCutoff: cutoff === 4 || cutoff === 8 ? cutoff : null,
  };
}
