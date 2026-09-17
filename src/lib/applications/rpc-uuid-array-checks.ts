import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeRpcUuidArrayShape,
  normalizeRpcUuidArray,
  parseBatchApplicationIds,
  parsePostgresUuidArrayLiteral,
} from "@/lib/applications/rpc-uuid-array";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

const ID_A = "561059d3-d3d3-42ea-b91f-f35b87b88ad6";
const ID_B = "00d391d6-4626-48a3-9048-f4105b656422";
const ID_C = "a1111111-1111-4111-8111-111111111111";

export function runRpcUuidArrayChecks() {
  // Happy path: PostgREST JSON array of UUID strings (documented scalar array shape)
  assert(
    parseBatchApplicationIds([ID_A, ID_B], 2).ok === true &&
      (parseBatchApplicationIds([ID_A, ID_B], 2) as { ok: true; ids: string[] }).ids.join("|") ===
        `${ID_A}|${ID_B}`,
    "2 returned UUIDs → success",
  );
  assert(
    parseBatchApplicationIds([ID_A, ID_B, ID_C], 3).ok === true,
    "3 returned UUIDs → success",
  );

  // Count mismatch
  assert(
    parseBatchApplicationIds([ID_A, ID_B], 3).ok === false &&
      (parseBatchApplicationIds([ID_A, ID_B], 3) as { ok: false; reason: string }).reason ===
        "count-mismatch",
    "wrong count → failure",
  );
  assert(
    parseBatchApplicationIds([ID_A], 2).ok === false,
    "one UUID when two expected → failure",
  );

  // Null / undefined
  assert(
    parseBatchApplicationIds(null, 2).ok === false &&
      (parseBatchApplicationIds(null, 2) as { ok: false; reason: string }).reason === "null",
    "null → failure",
  );
  assert(
    parseBatchApplicationIds(undefined, 2).ok === false,
    "undefined → failure",
  );

  // Malformed
  assert(
    parseBatchApplicationIds("not-an-array", 2).ok === false &&
      (parseBatchApplicationIds("not-an-array", 2) as { ok: false; reason: string }).reason ===
        "malformed",
    "plain string → failure",
  );
  assert(
    parseBatchApplicationIds([ID_A, "not-a-uuid"], 2).ok === false,
    "array with invalid UUID → failure",
  );
  assert(
    parseBatchApplicationIds([{ id: ID_A }, { id: ID_B }], 2).ok === false,
    "array of objects → failure",
  );
  assert(
    parseBatchApplicationIds({ a: ID_A, b: ID_B }, 2).ok === false,
    "multi-key object → failure",
  );
  assert(normalizeRpcUuidArray([])?.length === 0, "empty JSON array normalizes to []");
  assert(
    parseBatchApplicationIds([], 2).ok === false,
    "empty array wrong count → failure",
  );

  // PostgreSQL uuid[] text literal (narrow parse)
  const pgLiteral = `{${ID_A},${ID_B}}`;
  assert(
    parsePostgresUuidArrayLiteral(pgLiteral)?.join("|") === `${ID_A}|${ID_B}`,
    "pg literal parses two UUIDs",
  );
  assert(
    parseBatchApplicationIds(pgLiteral, 2).ok === true,
    "pg literal with matching count → success",
  );
  assert(
    parsePostgresUuidArrayLiteral(`{${ID_A},not-uuid}`) === null,
    "pg literal rejects non-UUID tokens",
  );
  assert(
    parsePostgresUuidArrayLiteral(`{{${ID_A}},{${ID_B}}}`) === null,
    "pg literal rejects nested arrays",
  );

  // Stale schema wrappers
  assert(
    parseBatchApplicationIds({ create_guest_applications: [ID_A, ID_B] }, 2).ok === true,
    "single-key object wrapper → success",
  );
  assert(
    parseBatchApplicationIds([{ create_guest_applications: [ID_A, ID_B] }], 2).ok === true,
    "row-wrapped object → success",
  );
  assert(
    parseBatchApplicationIds({ create_guest_applications: pgLiteral }, 2).ok === true,
    "object wrapper around pg literal → success",
  );

  // Shape metadata stays non-sensitive
  const shape = describeRpcUuidArrayShape([ID_A, ID_B]);
  assert(shape.dataKind === "array" && shape.arrayLength === 2, "shape metadata for arrays");
  assert(
    !JSON.stringify(shape).includes(ID_A),
    "shape metadata must not include UUID values",
  );

  // Wiring: both batch paths must use the shared parser
  const actions = read("src/lib/applications/actions.ts");
  assert(
    actions.includes('from "@/lib/applications/rpc-uuid-array"') &&
      actions.includes("parseBatchApplicationIds") &&
      actions.includes("describeRpcUuidArrayShape"),
    "actions import shared uuid[] normalizer",
  );
  assert(
    actions.includes('parseBatchApplicationIds(data, teamNames.length)') &&
      actions.includes('parseBatchApplicationIds(data, teamIds.length)'),
    "guest and club batch paths both normalize uuid[] results",
  );
  assert(
    !actions.includes("Array.isArray(data) ? data.map(String) : []"),
    "fragile Array.isArray-only uuid[] handling removed",
  );

  // Single (OFF/N=1) guest path still uses scalar create_guest_application
  assert(
    actions.includes('supabase.rpc("create_guest_application"') &&
      actions.includes("return { error: null, applicationId: data };"),
    "OFF/N=1 guest path unchanged (scalar uuid)",
  );

  // Types still declare string[] for the documented PostgREST shape
  const database = read("src/lib/supabase/database.ts");
  assert(
    database.includes("create_guest_applications:") &&
      database.includes("create_club_applications:") &&
      database.includes("Returns: string[];"),
    "Database types keep Returns: string[] for batch RPCs",
  );

  return "ok";
}
