#!/usr/bin/env node
/**
 * Focused regression coverage for CI function catalog lookup.
 *
 * These tests use a mock pg client that reproduces PostgreSQL catalog
 * semantics for named IN arguments (identity args include the name).
 *
 * Live to_regprocedure / DROP / return-shape checks still require disposable
 * PostgreSQL (GitHub Actions Inbox SQL Integration workflow).
 */

import assert from "node:assert/strict";
import {
  identityArgsEqualBareTypes,
  parseFunctionIdentity,
  resolveFunctionMeta,
} from "./function-catalog-lookup.mjs";

/** @type {Array<{ name: string, fn: () => Promise<void> | void }>} */
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

/**
 * Mock client: to_regprocedure('public.tournament_public_roster(text)') hits
 * a function whose pg_get_function_identity_arguments would be "p_slug text".
 */
function createCatalogMock({
  regprocedureHits = true,
  schemaName = "public",
  proname = "tournament_public_roster",
  identityArgs = "p_slug text",
  resultType = "TABLE(application_id uuid, club_name text, team_name text, age_group text, birth_year integer, group_id uuid, group_name text, group_sort_order integer)",
} = {}) {
  return {
    async query(sql, params = []) {
      assert.match(sql, /to_regprocedure\(\$1\)/);
      const identity = params[0];
      if (
        !regprocedureHits ||
        identity !== "public.tournament_public_roster(text)"
      ) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            oid: 424242,
            schema_name: schemaName,
            proname,
            identity_args: identityArgs,
            result_type: resultType,
            security_definer: true,
            config: ["search_path=public"],
          },
        ],
      };
    },
  };
}

test("parseFunctionIdentity accepts schema.name(args)", () => {
  const parsed = parseFunctionIdentity("public.tournament_public_roster(text)");
  assert.equal(parsed.schema, "public");
  assert.equal(parsed.name, "tournament_public_roster");
  assert.equal(parsed.args, "text");
});

test("parseFunctionIdentity rejects malformed identity", () => {
  assert.throws(() => parseFunctionIdentity("tournament_public_roster(text)"));
  assert.throws(() => parseFunctionIdentity("public.tournament_public_roster"));
});

test("named IN arg identity string is not equal to bare types (Phase 1S root cause)", () => {
  // PostgreSQL formats named parameters into identity arguments.
  assert.equal(identityArgsEqualBareTypes("p_slug text", "text"), false);
  assert.equal(identityArgsEqualBareTypes("text", "text"), true);
});

test("resolveFunctionMeta finds function declared with p_slug text via to_regprocedure(text)", async () => {
  const client = createCatalogMock({ identityArgs: "p_slug text" });
  const meta = await resolveFunctionMeta(
    client,
    "public.tournament_public_roster(text)",
  );
  assert.ok(meta);
  assert.equal(meta.schemaName, "public");
  assert.equal(meta.proname, "tournament_public_roster");
  assert.equal(meta.identityArgs, "p_slug text");
  assert.equal(meta.oid, 424242);
  assert.equal(meta.securityDefiner, true);
});

test("resolveFunctionMeta fails closed for nonexistent function", async () => {
  const client = createCatalogMock({ regprocedureHits: false });
  const meta = await resolveFunctionMeta(
    client,
    "public.tournament_public_roster(text)",
  );
  assert.equal(meta, null);
});

test("resolveFunctionMeta fails closed for unexpected signature", async () => {
  const client = createCatalogMock({ regprocedureHits: true });
  const meta = await resolveFunctionMeta(
    client,
    "public.tournament_public_roster(integer)",
  );
  assert.equal(meta, null);
});

test("resolveFunctionMeta rejects unexpected schema/name after resolution", async () => {
  const client = createCatalogMock({ schemaName: "extensions" });
  await assert.rejects(
    () => resolveFunctionMeta(client, "public.tournament_public_roster(text)"),
    /unexpected object/,
  );
});

let failed = 0;
for (const entry of tests) {
  try {
    await entry.fn();
    console.log(`ok ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error instanceof Error ? error.stack || error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} catalog lookup tests passed`);
console.log(
  "Note: live PostgreSQL to_regprocedure / migration apply checks require GitHub Actions.",
);
