#!/usr/bin/env node
/**
 * CI-only: disable Supabase CLI automatic project migration apply on start/reset.
 * Patches the checked-out supabase/config.toml in the runner workspace only.
 * Does not touch historical SQL migrations or production.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "supabase/config.toml");
const original = readFileSync(configPath, "utf8");

const marker = "[db.migrations]";
const markerIndex = original.indexOf(marker);
if (markerIndex < 0) {
  throw new Error("supabase/config.toml missing [db.migrations] section");
}

const after = original.slice(markerIndex);
const enabledMatch = after.match(/\nenabled\s*=\s*(true|false)/);
if (!enabledMatch) {
  throw new Error("[db.migrations] enabled setting not found");
}

const absoluteEnabledIndex = markerIndex + enabledMatch.index + 1; // skip leading \n
const lineEnd = original.indexOf("\n", absoluteEnabledIndex);
const currentLine = original.slice(
  absoluteEnabledIndex,
  lineEnd === -1 ? undefined : lineEnd,
);
if (!/^enabled\s*=\s*true\s*$/.test(currentLine) && !/^enabled\s*=\s*false\s*$/.test(currentLine)) {
  throw new Error(`Unexpected [db.migrations] enabled line: ${currentLine}`);
}

const patched = `${original.slice(0, absoluteEnabledIndex)}enabled = false${
  lineEnd === -1 ? "" : original.slice(lineEnd)
}`;

const migrationsBlock = patched.slice(patched.indexOf("[db.migrations]"));
const nextTable = migrationsBlock.indexOf("\n[", 1);
const migrationsOnly =
  nextTable === -1 ? migrationsBlock : migrationsBlock.slice(0, nextTable);
if (!/\nenabled\s*=\s*false\s*(\n|$)/.test(migrationsOnly)) {
  throw new Error("Failed to disable [db.migrations].enabled");
}

writeFileSync(configPath, patched, "utf8");
console.log("CI: set [db.migrations].enabled = false for local start (runner workspace only)");
