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
};

const BAMBINI_AGE = /\bbambini\b|\bg-?jugend\b|\bf-?jugend\b/i;

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
  if (input.ageGroup && BAMBINI_AGE.test(input.ageGroup)) {
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
  const byKickoff = new Map<string, Map<string, T>>();
  const order: string[] = [];
  const unscheduled: T[] = [];

  for (const match of [...matches].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!match.scheduledAt || !match.fieldId || !fields.includes(match.fieldId)) {
      unscheduled.push(match);
      continue;
    }
    let slot = byKickoff.get(match.scheduledAt);
    if (!slot) {
      slot = new Map<string, T>();
      byKickoff.set(match.scheduledAt, slot);
      order.push(match.scheduledAt);
    }
    // First match wins a field cell; a genuine double-booking would already be
    // rejected by validation, so this is defensive only.
    if (!slot.has(match.fieldId)) {
      slot.set(match.fieldId, match);
    }
  }

  const rows: Array<PdfTimelineRow<T>> = order
    .sort((a, b) => a.localeCompare(b))
    .map((kickoff) => {
      const slot = byKickoff.get(kickoff)!;
      return {
        scheduledAt: kickoff,
        cells: fields.map((fieldId) => ({ fieldId, match: slot.get(fieldId) ?? null })),
      };
    });

  for (const match of unscheduled) {
    rows.push({
      scheduledAt: null,
      cells: fields.map((fieldId) => ({
        fieldId,
        match: match.fieldId === fieldId || (!match.fieldId && fieldId === fields[0]) ? match : null,
      })),
    });
  }

  return rows;
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
