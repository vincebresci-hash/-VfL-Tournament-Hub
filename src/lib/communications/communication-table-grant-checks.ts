import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

function readSelectGrantMigration() {
  return read(
    "supabase/migrations/20260901140000_communication_table_select_grants.sql",
  );
}

function readUpdateGrantMigration() {
  return read(
    "supabase/migrations/20260916190000_communication_table_update_grant.sql",
  );
}

export function runCommunicationTableGrantChecks() {
  const selectMigration = readSelectGrantMigration();
  const updateMigration = readUpdateGrantMigration();
  const rlsMigration = read(
    "supabase/migrations/20260831210000_rbac_domain_rls_enforcement.sql",
  );

  assert(
    selectMigration.includes(
      "GRANT SELECT ON TABLE public.tournament_communications TO authenticated;",
    ),
    "tournament_communications authenticated SELECT grant",
  );
  assert(
    selectMigration.includes(
      "GRANT SELECT ON TABLE public.communication_recipients TO authenticated;",
    ),
    "communication_recipients authenticated SELECT grant",
  );
  assert(
    selectMigration.includes(
      "GRANT SELECT ON TABLE public.communication_confirmation_tokens TO authenticated;",
    ),
    "communication_confirmation_tokens authenticated SELECT grant",
  );

  assert(
    updateMigration.includes(
      "GRANT UPDATE ON TABLE public.tournament_communications TO authenticated;",
    ),
    "tournament_communications authenticated UPDATE grant",
  );

  assert(
    !updateMigration.includes("TO anon") &&
      !updateMigration.includes("TO public") &&
      !updateMigration.toLowerCase().includes("service_role"),
    "update grant is authenticated-only (no anon/public/service_role)",
  );
  assert(
    !updateMigration.includes("GRANT INSERT") &&
      !updateMigration.includes("GRANT DELETE") &&
      !updateMigration.includes("GRANT ALL"),
    "update grant does not add INSERT/DELETE/ALL",
  );
  assert(
    !updateMigration.includes("GRANT SELECT"),
    "update grant migration does not restate SELECT",
  );

  assert(
    !selectMigration.includes("GRANT UPDATE") &&
      !selectMigration.includes("GRANT INSERT") &&
      !selectMigration.includes("GRANT DELETE"),
    "select grant migration remains SELECT-only",
  );

  for (const [label, migration] of [
    ["select", selectMigration],
    ["update", updateMigration],
  ] as const) {
    assert(!migration.includes("CREATE POLICY"), `${label} grant does not change policies`);
    assert(!migration.includes("DROP POLICY"), `${label} grant does not drop policies`);
    assert(
      !migration.includes("ENABLE ROW LEVEL SECURITY"),
      `${label} grant does not change RLS`,
    );
    assert(
      !migration.includes("CREATE OR REPLACE FUNCTION"),
      `${label} grant does not change RPCs`,
    );
    assert(!migration.includes("REVOKE"), `${label} grant does not revoke privileges`);
  }

  const selectGrantLines = selectMigration
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  assert(
    selectGrantLines.length === 3,
    "select grant migration contains only three GRANT statements",
  );

  const updateGrantLines = updateMigration
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
  assert(
    updateGrantLines.length === 1 &&
      updateGrantLines[0] ===
        "GRANT UPDATE ON TABLE public.tournament_communications TO authenticated;",
    "update grant migration contains exactly one GRANT UPDATE statement",
  );

  assert(
    rlsMigration.includes("DROP POLICY IF EXISTS tournament_communications_admin_all") &&
      rlsMigration.includes(
        "CREATE POLICY tournament_communications_admin_all\n  ON public.tournament_communications\n  FOR ALL\n  TO authenticated\n  USING (public.has_rbac_permission('communications.manage'))\n  WITH CHECK (public.has_rbac_permission('communications.manage'));",
      ),
    "tournament_communications manage RLS policy preserved",
  );
  assert(
    rlsMigration.includes("has_rbac_permission('communications.manage')"),
    "communications.manage still required by RLS",
  );

  return "ok";
}
