/**
 * Static fail-closed check: function return-type compat allowlist must match
 * reviewed SHA-256 fingerprints and contain the expected CREATE OR REPLACE.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNCTION_RETURN_COMPAT_MIGRATIONS } from "./function-return-compat-migrations.mjs";

let failed = false;

for (const [filename, spec] of Object.entries(FUNCTION_RETURN_COMPAT_MIGRATIONS)) {
  const fullPath = join(process.cwd(), "supabase/migrations", filename);
  let content;
  try {
    content = readFileSync(fullPath, "utf8");
  } catch {
    console.error(`MISSING ${filename}`);
    failed = true;
    continue;
  }

  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  if (digest !== spec.sha256) {
    console.error(`FINGERPRINT MISMATCH ${filename}`);
    console.error(`  expected ${spec.sha256}`);
    console.error(`  actual   ${digest}`);
    failed = true;
    continue;
  }

  if (!content.includes("CREATE OR REPLACE FUNCTION public.tournament_public_roster(p_slug text)")) {
    console.error(`EXPECTED FUNCTION DEFINITION MISSING in ${filename}`);
    failed = true;
  }
  if (!content.includes("club_id uuid") || !content.includes("logo_url text")) {
    console.error(`EXPECTED NEW RETURN COLUMNS MISSING in ${filename}`);
    failed = true;
  }
  if (spec.dropStatement.includes("CASCADE") || /cascade/i.test(spec.dropStatement)) {
    console.error(`DROP STATEMENT MUST NOT USE CASCADE for ${filename}`);
    failed = true;
  }
  if (!/^DROP FUNCTION public\.tournament_public_roster\(text\);$/.test(spec.dropStatement)) {
    console.error(`DROP STATEMENT MUST BE EXACT for ${filename}`);
    failed = true;
  }

  console.log(`ok ${filename}`);
}

if (failed) {
  process.exit(1);
}
