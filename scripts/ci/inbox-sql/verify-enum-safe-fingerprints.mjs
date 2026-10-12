#!/usr/bin/env node
/**
 * Static fail-closed check: allowlisted historical migrations must match
 * reviewed SHA-256 fingerprints and contain the expected enum ADD VALUE SQL.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENUM_SAFE_MIGRATIONS } from "./enum-safe-migrations.mjs";

let failed = false;

for (const [filename, spec] of Object.entries(ENUM_SAFE_MIGRATIONS)) {
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

  for (const statement of spec.enumStatements) {
    if (!content.includes(statement)) {
      console.error(`ENUM STATEMENT MISSING in ${filename}`);
      console.error(statement);
      failed = true;
    }
  }

  console.log(`ok ${filename}`);
}

if (failed) {
  process.exit(1);
}
