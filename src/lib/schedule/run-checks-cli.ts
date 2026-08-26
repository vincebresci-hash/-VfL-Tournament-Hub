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
import { runTournamentParticipantLogoManagementChecks } from "@/lib/tournament-participant-logos-checks";
import { runLivePageSelfChecks } from "@/lib/live/live-page-checks";
import { runMatchCenterDesignChecks } from "@/lib/live/match-center-checks";
import { runHomepageSelfChecks } from "@/lib/home/homepage-checks";
import {
  runLiveMatchLayoutChecks,
  runPublicTeamLabelChecks,
} from "@/lib/schedule/names-checks";
import { runTournamentStatusCapacityChecks } from "@/lib/tournament-status-checks";
import { runSiteUrlAndCspChecks } from "@/lib/site-checks";
import { runAuthLoginValidationChecks } from "@/lib/auth/auth-login-validation-checks";
import { runAdminScheduleParticipantChecks } from "@/lib/schedule/admin-schedule-participants-checks";
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
  const participantLogoManagementChecks = runTournamentParticipantLogoManagementChecks();
  const clubLogoStorageUploadChecks = runTournamentParticipantLogoManagementChecks();
  const livePageChecks = runLivePageSelfChecks();
  const matchCenterDesignChecks = runMatchCenterDesignChecks();
  const homepageChecks = runHomepageSelfChecks();
  const publicTeamLabelChecks = runPublicTeamLabelChecks();
  const liveMatchLayoutChecks = runLiveMatchLayoutChecks();
  const tournamentStatusCapacityChecks = runTournamentStatusCapacityChecks();
  const siteUrlAndCspChecks = runSiteUrlAndCspChecks();
  const authLoginValidationChecks = runAuthLoginValidationChecks();
  const adminScheduleParticipantChecks = runAdminScheduleParticipantChecks();
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
  console.log(`participant-logo-management-checks: ${participantLogoManagementChecks}`);
  console.log(`club-logo-storage-upload-checks: ${clubLogoStorageUploadChecks}`);
  console.log(`live-page-checks: ${livePageChecks}`);
  console.log(`match-center-design-checks: ${matchCenterDesignChecks}`);
  console.log(`homepage-checks: ${homepageChecks}`);
  console.log(`public-team-label-checks: ${publicTeamLabelChecks}`);
  console.log(`live-match-layout-checks: ${liveMatchLayoutChecks}`);
  console.log(`tournament-status-capacity-checks: ${tournamentStatusCapacityChecks}`);
  console.log(`site-url-csp-checks: ${siteUrlAndCspChecks}`);
  console.log(`auth-login-validation-checks: ${authLoginValidationChecks}`);
  console.log(`admin-schedule-participant-checks: ${adminScheduleParticipantChecks}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
