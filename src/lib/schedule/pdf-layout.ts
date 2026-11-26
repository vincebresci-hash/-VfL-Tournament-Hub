/**
 * CL Release 6 §5 — pure layout decisions for the central schedule PDF generator.
 *
 * No React, no DB. Decides which reference layout a tournament maps to and
 * groups matches into a shared timeline with one column per field (multi-field
 * layout). All content is derived from the actual tournament data.
 */

export type PdfLayout = "cl-single" | "cl-multi" | "groups" | "bambini";

export type PdfLayoutInput = {
  competitionFormat: "round-robin" | "groups-knockout" | "champions-league" | null;
  groupCount: number;
  fieldCount: number;
  ageGroup?: string | null;
  playFormat?: string | null;
};

const BAMBINI_AGE = /\bbambini\b|\bg-?jugend\b|\bminis?\b/i;
const BAMBINI_FORMAT = /\bbambini\b|\bkinderfestival\b|\bfunino\b|\bohne\s+(?:ergebnisse?|wertung|tabelle)\b/i;

/**
 * Map a tournament to a reference layout:
 *  - cl-single: Champions League on one field (Layout A)
 *  - cl-multi:  Champions League on multiple fields (Layout B)
 *  - groups:    classic group phase (Layout C)
 *  - bambini:   schedule-only (no tables / knockout)
 */
export function resolvePdfLayout(input: PdfLayoutInput): PdfLayout {
  if (input.competitionFormat === "champions-league") {
    return input.fieldCount > 1 ? "cl-multi" : "cl-single";
  }
  // F-Jugend is intentionally not inferred as Bambini. The schedule-only PDF
  // is selected only by an explicit Bambini/G-Jugend age group or a configured
  // no-results play format.
  if (
    (input.ageGroup && BAMBINI_AGE.test(input.ageGroup)) ||
    (input.playFormat && BAMBINI_FORMAT.test(input.playFormat))
  ) {
    return "bambini";
  }
  return "groups";
}

export function pdfLayoutShowsStandings(layout: PdfLayout): boolean {
  return layout !== "bambini";
}

export type PdfTimelineMatch = {
  key: string;
  scheduledAt: string | null;
  fieldId: string | null;
  sortOrder: number;
};

export type PdfTimelineCell<T> = { fieldId: string; match: T | null };

export type PdfTimelineRow<T> = {
  /** Shared kickoff (ISO) for this row, or null for unscheduled. */
  scheduledAt: string | null;
  cells: Array<PdfTimelineCell<T>>;
};

/**
 * Group matches into timeline rows keyed by kickoff, with one cell per field —
 * the multi-field reference layout (Layout B). Unscheduled matches collapse into
 * trailing rows. Stable and deterministic.
 */
export function groupMatchesByTimeslot<T extends PdfTimelineMatch>(
  matches: readonly T[],
  fieldIds: readonly string[],
): Array<PdfTimelineRow<T>> {
  const fields = [...fieldIds];
  const fallbackFields = fields.length > 0 ? fields : ["unassigned"];
  const byKickoff = new Map<string, Array<Map<string, T>>>();

  for (const match of [...matches].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const kickoff = match.scheduledAt ?? "~unscheduled";
    const preferredField =
      match.fieldId && fallbackFields.includes(match.fieldId)
        ? match.fieldId
        : fallbackFields[0]!;
    const rows = byKickoff.get(kickoff) ?? [];
    let slot = rows.find((candidate) => !candidate.has(preferredField));
    if (!slot) {
      slot = new Map<string, T>();
      rows.push(slot);
    }
    slot.set(preferredField, match);
    byKickoff.set(kickoff, rows);
  }

  return [...byKickoff.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([kickoff, slots]) =>
      slots.map((slot) => ({
        scheduledAt: kickoff === "~unscheduled" ? null : kickoff,
        cells: fallbackFields.map((fieldId) => ({
          fieldId,
          match: slot.get(fieldId) ?? null,
        })),
      })),
    );
}

/** Assign stable 1-based game numbers in schedule order. */
export function assignGameNumbers<T extends PdfTimelineMatch>(
  matches: readonly T[],
): Map<string, number> {
  const ordered = [...matches].sort(
    (a, b) =>
      (a.scheduledAt ?? "~").localeCompare(b.scheduledAt ?? "~") || a.sortOrder - b.sortOrder,
  );
  const numbers = new Map<string, number>();
  ordered.forEach((match, index) => numbers.set(match.key, index + 1));
  return numbers;
}
