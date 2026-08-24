import { runScheduleSelfChecks } from "./run-checks";
import { runApplicationWindowSelfChecks } from "@/lib/public-application-state";
import { runMeinTurnierplanSelfChecks } from "@/lib/mein-turnierplan";
import { runMeinTurnierplanImportSelfChecks } from "@/lib/mein-turnierplan-import";
import { runMeinTurnierplanNormalizeSelfChecks } from "@/lib/mein-turnierplan-normalize";
import { runMeinTurnierplanLiveRenderSelfChecks } from "@/lib/mein-turnierplan-live-render";

try {
  const schedule = runScheduleSelfChecks();
  const applicationWindow = runApplicationWindowSelfChecks();
  const meinTurnierplan = runMeinTurnierplanSelfChecks();
  const meinTurnierplanImport = runMeinTurnierplanImportSelfChecks();
  const meinTurnierplanNormalize = runMeinTurnierplanNormalizeSelfChecks();
  const meinTurnierplanLiveRender = runMeinTurnierplanLiveRenderSelfChecks();
  console.log(`schedule-checks: ${schedule}`);
  console.log(`application-window-checks: ${applicationWindow}`);
  console.log(`mein-turnierplan-checks: ${meinTurnierplan}`);
  console.log(`mein-turnierplan-import-checks: ${meinTurnierplanImport}`);
  console.log(`mein-turnierplan-normalize-checks: ${meinTurnierplanNormalize}`);
  console.log(`mein-turnierplan-live-render-checks: ${meinTurnierplanLiveRender}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
