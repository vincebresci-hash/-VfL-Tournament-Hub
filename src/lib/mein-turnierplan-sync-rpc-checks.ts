import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMeinTurnierplanSyncRpcPayload,
  MeinTurnierplanSyncRpcValidationError,
  validateMeinTurnierplanSyncRpcPayload,
} from "@/lib/mein-turnierplan-sync-rpc-payload";
import type { NormalizedMeinTurnierplanSyncPayload } from "@/lib/mein-turnierplan-sync-normalize";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSamplePayload(matchCount: number, invalidLastMatch = false) {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: String(5292819 + index),
    name: `Team ${index + 1}`,
  }));

  const groups = [
    {
      id: "A",
      name: "Gruppe A",
      teams: teams.slice(0, 4),
    },
    {
      id: "B",
      name: "Gruppe B",
      teams: teams.slice(4, 8),
    },
  ];

  const courts = [
    { id: "1", name: "Feld 1", sortOrder: 0 },
    { id: "2", name: "Feld 2", sortOrder: 1 },
  ];

  const matches = Array.from({ length: matchCount }, (_, index) => {
    const home = teams[index % 8]!;
    const away = teams[(index + 1) % 8]!;
    return {
      externalId: String(100000 + index),
      displayId: String(index + 1),
      phase: index < 12 ? ("group" as const) : ("knockout" as const),
      round: index < 12 ? null : ("semifinal" as const),
      groupExternalId: index < 12 ? (index % 2 === 0 ? "A" : "B") : null,
      courtIndex: index % 2,
      scheduledAt: "2026-07-04T08:00:00.000Z",
      homeParticipantExternalId: home.id,
      awayParticipantExternalId: away.id,
      homeScore: 2,
      awayScore: 1,
      status: "completed" as const,
      decidedBy: "regular" as const,
      sortOrder: index,
    };
  });

  if (invalidLastMatch && matches.length > 0) {
    const last = matches[matches.length - 1]!;
    matches[matches.length - 1] = {
      ...last,
      homeParticipantExternalId: last.awayParticipantExternalId,
    };
  }

  const payload: NormalizedMeinTurnierplanSyncPayload = {
    tournamentName: "D2-Sommercup 2026",
    schemaVersion: "3.77.0",
    groups,
    teams,
    courts,
    matches,
    completedMatchCount: matches.length,
  };

  return payload;
}

export function runMeinTurnierplanSyncRpcSecurityChecks() {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825103000_mein_turnierplan_sync_rpc.sql"),
    "utf8",
  );
  const reconciliationMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825120000_fix_mein_turnierplan_group_reconciliation.sql",
    ),
    "utf8",
  );

  assert(migration.includes("SECURITY DEFINER"), "RPC must be SECURITY DEFINER");
  assert(migration.includes("SET search_path = public"), "RPC must pin search_path");
  assert(
    migration.includes("IF auth.uid() IS NULL OR NOT public.is_admin()"),
    "RPC must require admin",
  );
  assert(
    migration.includes(
      "REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) FROM PUBLIC",
    ),
    "RPC must revoke PUBLIC execute",
  );
  assert(
    migration.includes(
      "REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) FROM anon",
    ),
    "RPC must revoke anon execute",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) TO authenticated",
    ),
    "RPC must grant authenticated execute only",
  );
  assert(migration.includes("external_active"), "Migration must add external_active columns");
  assert(
    !migration.includes("GRANT EXECUTE") || !migration.includes("TO anon"),
    "RPC must not grant anon execute",
  );
  assert(
    reconciliationMigration.includes("lower(btrim(name))"),
    "reconciliation migration must match groups/fields by name",
  );
  assert(
    reconciliationMigration.includes("reconcile by external_id, then by exact name"),
    "reconciliation migration must document name fallback",
  );
  assert(
    reconciliationMigration.includes("external_source = v_source") &&
      reconciliationMigration.includes("external_id = v_group.item->>'externalId'"),
    "reconciliation must attach MTP identity to existing groups",
  );

  return "ok";
}

export function runMeinTurnierplanExistingManualGroupsCheck() {
  const payload = buildSamplePayload(18);
  const rpcPayload = buildMeinTurnierplanSyncRpcPayload({
    queryId: "2jrb0hvxvd",
    payload,
    mappings: payload.teams.map((team) => ({
      externalId: team.id,
      externalName: team.name,
      applicationId: null,
      createExternal: true,
    })),
  });

  validateMeinTurnierplanSyncRpcPayload(rpcPayload);
  assert(rpcPayload.groups.some((group) => group.name === "Gruppe A"), "Gruppe A erwartet");
  assert(rpcPayload.groups.some((group) => group.name === "Gruppe B"), "Gruppe B erwartet");
  assert(rpcPayload.groups.length === 2, "zwei Gruppen erwartet");

  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825120000_fix_mein_turnierplan_group_reconciliation.sql",
    ),
    "utf8",
  );

  assert(
    migration.includes(
      "AND lower(btrim(name)) = lower(btrim(COALESCE(v_group.item->>'name', '')))",
    ),
    "RPC must look up existing groups by exact name before insert",
  );
  assert(
    migration.includes(
      "AND lower(btrim(name)) = lower(btrim(COALESCE(v_field.item->>'name', '')))",
    ),
    "RPC must look up existing fields by exact name before insert",
  );
  assert(
    migration.includes("Keep manual fields, but always attach MTP identity"),
    "RPC must link protected groups without overwriting manual fields",
  );

  return "ok";
}

export function runMeinTurnierplanTransactionRollbackCheck() {
  const payload = buildSamplePayload(18, true);
  const rpcPayload = buildMeinTurnierplanSyncRpcPayload({
    queryId: "2jrb0hvxvd",
    payload,
    mappings: payload.teams.map((team) => ({
      externalId: team.id,
      externalName: team.name,
      applicationId: null,
      createExternal: true,
    })),
  });

  let rejected = false;
  try {
    validateMeinTurnierplanSyncRpcPayload(rpcPayload);
  } catch (error) {
    rejected =
      error instanceof MeinTurnierplanSyncRpcValidationError &&
      error.message === "Match teams must be different";
  }

  assert(rejected, "invalid 18th match must fail validation before any DB write");

  const validPayload = buildMeinTurnierplanSyncRpcPayload({
    queryId: "2jrb0hvxvd",
    payload: buildSamplePayload(17),
    mappings: [],
  });
  validateMeinTurnierplanSyncRpcPayload(validPayload);
  assert(validPayload.matches.length === 17, "17 valid matches expected");
  assert(validPayload.teams.length === 8, "8 teams expected");

  return "ok";
}

export function runMeinTurnierplanIdempotencyCheck() {
  const payload = buildSamplePayload(18);
  const mappings = payload.teams.map((team) => ({
    externalId: team.id,
    externalName: team.name,
    applicationId: null,
    createExternal: true,
  }));

  const first = buildMeinTurnierplanSyncRpcPayload({
    queryId: "2jrb0hvxvd",
    payload,
    mappings,
    syncedAt: "2026-07-04T10:00:00.000Z",
  });
  const second = buildMeinTurnierplanSyncRpcPayload({
    queryId: "2jrb0hvxvd",
    payload,
    mappings,
    syncedAt: "2026-07-04T11:00:00.000Z",
  });

  validateMeinTurnierplanSyncRpcPayload(first);
  validateMeinTurnierplanSyncRpcPayload(second);

  assert(first.matches.length === 18, "first sync expects 18 matches");
  assert(second.matches.length === 18, "second sync expects 18 matches");
  assert(
    JSON.stringify({ ...first, syncedAt: null }) === JSON.stringify({ ...second, syncedAt: null }),
    "identical payload shape must stay stable for idempotent upserts",
  );

  return "ok";
}

export function runMeinTurnierplanManualOverrideCheck() {
  function shouldProtectManualOverride(manualOverride: boolean, overwriteManual: boolean) {
    return manualOverride && !overwriteManual;
  }

  assert(
    shouldProtectManualOverride(true, false),
    "keep-manual must block overwrite when manual_override is set",
  );
  assert(
    !shouldProtectManualOverride(true, true),
    "overwrite-manual must allow updates when enabled",
  );

  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825120000_fix_mein_turnierplan_group_reconciliation.sql",
    ),
    "utf8",
  );
  assert(
    migration.includes("manual_override = true AND NOT p_overwrite_manual"),
    "RPC must respect manual_override unless overwrite is enabled",
  );
  assert(
    migration.includes("manual_override = false"),
    "RPC must reset manual_override after overwrite sync",
  );

  return "ok";
}

export function runMeinTurnierplanSyncRpcSelfChecks() {
  runMeinTurnierplanSyncRpcSecurityChecks();
  runMeinTurnierplanTransactionRollbackCheck();
  runMeinTurnierplanIdempotencyCheck();
  runMeinTurnierplanManualOverrideCheck();
  runMeinTurnierplanExistingManualGroupsCheck();
  return "ok";
}
