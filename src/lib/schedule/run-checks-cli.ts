import { runScheduleSelfChecks } from "./run-checks";
import { runApplicationWindowSelfChecks } from "@/lib/public-application-state";
import { runMeinTurnierplanSelfChecks } from "@/lib/mein-turnierplan";
import { runMeinTurnierplanImportSelfChecks } from "@/lib/mein-turnierplan-import";
import { runMeinTurnierplanNormalizeSelfChecks } from "@/lib/mein-turnierplan-normalize";
import { runMeinTurnierplanLiveRenderSelfChecks } from "@/lib/mein-turnierplan-live-render";
import { runMeinTurnierplanPublicSourceSelfChecks } from "@/lib/mein-turnierplan-public-source";
import { runMeinTurnierplanSyncSelfChecks } from "@/lib/mein-turnierplan-sync";
import { runMeinTurnierplanParticipantCountChecks } from "@/lib/mein-turnierplan-participants-checks";
import { runTournamentParticipantsListChecks } from "@/lib/tournament-participants-checks";
import {
  runMeinTurnierplanIdempotencyCheck,
  runMeinTurnierplanExistingManualGroupsCheck,
  runMeinTurnierplanManualOverrideCheck,
  runMeinTurnierplanSyncRpcSelfChecks,
  runMeinTurnierplanTransactionRollbackCheck,
} from "@/lib/mein-turnierplan-sync-rpc-checks";

try {
  const schedule = runScheduleSelfChecks();
  const applicationWindow = runApplicationWindowSelfChecks();
  const meinTurnierplan = runMeinTurnierplanSelfChecks();
  const meinTurnierplanImport = runMeinTurnierplanImportSelfChecks();
  const meinTurnierplanNormalize = runMeinTurnierplanNormalizeSelfChecks();
  const meinTurnierplanLiveRender = runMeinTurnierplanLiveRenderSelfChecks();
  const meinTurnierplanPublicSource = runMeinTurnierplanPublicSourceSelfChecks();
  const meinTurnierplanSync = runMeinTurnierplanSyncSelfChecks();
  const meinTurnierplanSyncRpc = runMeinTurnierplanSyncRpcSelfChecks();
  const transactionRollbackCheck = runMeinTurnierplanTransactionRollbackCheck();
  const idempotencyCheck = runMeinTurnierplanIdempotencyCheck();
  const manualOverrideCheck = runMeinTurnierplanManualOverrideCheck();
  const existingManualGroupsCheck = runMeinTurnierplanExistingManualGroupsCheck();
  const participantCountChecks = runMeinTurnierplanParticipantCountChecks();
  const combinedParticipantListChecks = runTournamentParticipantsListChecks();
  console.log(`schedule-checks: ${schedule}`);
  console.log(`application-window-checks: ${applicationWindow}`);
  console.log(`mein-turnierplan-checks: ${meinTurnierplan}`);
  console.log(`mein-turnierplan-import-checks: ${meinTurnierplanImport}`);
  console.log(`mein-turnierplan-normalize-checks: ${meinTurnierplanNormalize}`);
  console.log(`mein-turnierplan-live-render-checks: ${meinTurnierplanLiveRender}`);
  console.log(`mein-turnierplan-public-source-checks: ${meinTurnierplanPublicSource}`);
  console.log(`mein-turnierplan-sync-checks: ${meinTurnierplanSync}`);
  console.log(`mein-turnierplan-sync-rpc-checks: ${meinTurnierplanSyncRpc}`);
  console.log(`transaction-rollback-check: ${transactionRollbackCheck}`);
  console.log(`idempotency-check: ${idempotencyCheck}`);
  console.log(`manual-override-check: ${manualOverrideCheck}`);
  console.log(`existing-manual-groups-check: ${existingManualGroupsCheck}`);
  console.log(`mein-turnierplan-participant-count-checks: ${participantCountChecks}`);
  console.log(`combined-participant-list-checks: ${combinedParticipantListChecks}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
