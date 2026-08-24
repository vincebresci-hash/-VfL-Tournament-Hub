import { runScheduleSelfChecks } from "./run-checks";
import { runApplicationWindowSelfChecks } from "@/lib/public-application-state";
import { runMeinTurnierplanSelfChecks } from "@/lib/mein-turnierplan";
import { runMeinTurnierplanImportSelfChecks } from "@/lib/mein-turnierplan-import";

try {
  const schedule = runScheduleSelfChecks();
  const applicationWindow = runApplicationWindowSelfChecks();
  const meinTurnierplan = runMeinTurnierplanSelfChecks();
  const meinTurnierplanImport = runMeinTurnierplanImportSelfChecks();
  console.log(`schedule-checks: ${schedule}`);
  console.log(`application-window-checks: ${applicationWindow}`);
  console.log(`mein-turnierplan-checks: ${meinTurnierplan}`);
  console.log(`mein-turnierplan-import-checks: ${meinTurnierplanImport}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
