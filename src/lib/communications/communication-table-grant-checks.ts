import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readGrantMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260901140000_communication_table_select_grants.sql",
    ),
    "utf8",
  );
}

export function runCommunicationTableGrantChecks() {
  const migration = readGrantMigration();

  assert(
    migration.includes(
      "GRANT SELECT ON TABLE public.tournament_communications TO authenticated;",
    ),
    "tournament_communications authenticated SELECT grant",
  );
  assert(
    migration.includes(
      "GRANT SELECT ON TABLE public.communication_recipients TO authenticated;",
    ),
    "communication_recipients authenticated SELECT grant",
  );
  assert(
    migration.includes(
      "GRANT SELECT ON TABLE public.communication_confirmation_tokens TO authenticated;",
    ),
    "communication_confirmation_tokens authenticated SELECT grant",
  );

  assert(!migration.includes("CREATE POLICY"), "grant migration does not change policies");
  assert(!migration.includes("DROP POLICY"), "grant migration does not drop policies");
  assert(!migration.includes("ENABLE ROW LEVEL SECURITY"), "grant migration does not change RLS");
  assert(!migration.includes("CREATE OR REPLACE FUNCTION"), "grant migration does not change RPCs");
  assert(!migration.includes("REVOKE"), "grant migration does not revoke privileges");

  const grantLines = migration
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  assert(grantLines.length === 3, "grant migration contains only three GRANT statements");

  return "ok";
}
