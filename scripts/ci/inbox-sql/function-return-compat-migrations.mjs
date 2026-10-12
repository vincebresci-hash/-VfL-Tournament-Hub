/**
 * Narrow, fail-closed allowlist for CI-only function return-type compatibility.
 * Historical migration files are never modified.
 *
 * Only public.tournament_public_roster(text) is handled: PostgreSQL rejects
 * CREATE OR REPLACE when RETURNS TABLE shape changes (8 → 10 columns).
 *
 * Fingerprint pinned from feature/ionos-inbox-readonly @
 * e88e9f40b674bb01a537791677067535650bed6e.
 */

/**
 * @typedef {{
 *   sha256: string,
 *   functionIdentity: string,
 *   dropStatement: string,
 *   expectedOldResultColumns: Array<{ name: string, type: string }>,
 *   expectedNewResultColumns: Array<{ name: string, type: string }>,
 * }} FunctionReturnCompatSpec
 */

/** @type {Record<string, FunctionReturnCompatSpec>} */
export const FUNCTION_RETURN_COMPAT_MIGRATIONS = {
  "20260825160000_participant_logos.sql": {
    sha256: "7675caf40629a10137eef429807007e93d0fe5790d97ad3f65a77980d2a52e2a",
    functionIdentity: "public.tournament_public_roster(text)",
    // Exact statement required by Phase 1R — never CASCADE, never IF EXISTS.
    dropStatement: "DROP FUNCTION public.tournament_public_roster(text);",
    expectedOldResultColumns: [
      { name: "application_id", type: "uuid" },
      { name: "club_name", type: "text" },
      { name: "team_name", type: "text" },
      { name: "age_group", type: "text" },
      { name: "birth_year", type: "integer" },
      { name: "group_id", type: "uuid" },
      { name: "group_name", type: "text" },
      { name: "group_sort_order", type: "integer" },
    ],
    expectedNewResultColumns: [
      { name: "application_id", type: "uuid" },
      { name: "club_name", type: "text" },
      { name: "team_name", type: "text" },
      { name: "age_group", type: "text" },
      { name: "birth_year", type: "integer" },
      { name: "group_id", type: "uuid" },
      { name: "group_name", type: "text" },
      { name: "group_sort_order", type: "integer" },
      { name: "club_id", type: "uuid" },
      { name: "logo_url", type: "text" },
    ],
  },
};

/**
 * Normalize pg_get_function_result() / TABLE(...) text for comparison.
 * @param {string} resultText
 * @returns {Array<{ name: string, type: string }>}
 */
export function parseTableResultColumns(resultText) {
  const normalized = String(resultText || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const match = normalized.match(/^table\s*\((.*)\)$/);
  if (!match) {
    throw new Error(`Expected TABLE(...) result type, got: ${resultText}`);
  }
  const inner = match[1].trim();
  if (!inner) {
    return [];
  }
  return inner.split(",").map((part) => {
    const tokens = part.trim().split(" ").filter(Boolean);
    if (tokens.length < 2) {
      throw new Error(`Could not parse result column: ${part}`);
    }
    return { name: tokens[0], type: tokens.slice(1).join(" ") };
  });
}

/**
 * @param {Array<{ name: string, type: string }>} actual
 * @param {Array<{ name: string, type: string }>} expected
 * @param {string} label
 */
export function assertResultColumnsMatch(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: expected ${expected.length} result columns, got ${actual.length} ` +
        `(${actual.map((c) => c.name).join(", ")})`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i].name !== expected[i].name || actual[i].type !== expected[i].type) {
      throw new Error(
        `${label}: column ${i} mismatch — expected ${expected[i].name} ${expected[i].type}, ` +
          `got ${actual[i].name} ${actual[i].type}`,
      );
    }
  }
}
