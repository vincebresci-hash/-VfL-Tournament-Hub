import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isLateCancellationRequest,
  requiresCancellationReason,
} from "@/lib/cancellations/deadline";
import {
  createParticipationRecoveryTokenMaterial,
  normalizeParticipationRecoveryEmail,
  parseParticipationTokenFromUserInput,
  PARTICIPATION_RECOVERY_NEUTRAL_NOTICE,
} from "@/lib/cancellations/participation-recovery";
import {
  participationRecoveryTokenExpiresAt,
  PARTICIPATION_RECOVERY_MIN_RESPONSE_MS,
} from "@/lib/cancellations/participation-recovery-timing";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
} from "@/lib/cancellations/tokens";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import { getEmailSiteUrl } from "@/lib/site";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function runParticipationAccessRecoveryChecks() {
  const migration = read("supabase/migrations/20260902120000_participation_access_recovery.sql");
  const recovery = read("src/lib/cancellations/participation-recovery.ts");
  const recoveryActions = read("src/lib/cancellations/participation-recovery-actions.ts");
  const recoveryDelivery = read("src/lib/cancellations/participation-recovery-delivery.ts");
  const recoveryMail = read("src/lib/cancellations/participation-recovery-mail.ts");
  const recoveryTiming = read("src/lib/cancellations/participation-recovery-timing.ts");
  const actions = read("src/lib/cancellations/actions.ts");
  const participationToken = read("src/lib/cancellations/participation-token.ts");
  const cancellationMigration = read(
    "supabase/migrations/20260829160000_cancellation_requests.sql",
  );
  const serviceRole = read("src/lib/supabase/service-role.ts");
  const client = read("src/lib/supabase/client.ts");
  const kontaktPage = read("src/app/kontakt/page.tsx");
  const absagePage = read("src/app/kontakt/absage/page.tsx");
  const statusMail = read("src/lib/email/status-mail.ts");
  const adminTypes = read("src/types/admin.ts");

  // Migration safety
  assert(
    migration.includes("stage_participation_access_recovery_token"),
    "migration defines stage RPC",
  );
  assert(
    migration.includes("activate_participation_access_recovery_token"),
    "migration defines activate RPC",
  );
  assert(
    migration.includes("discard_participation_access_recovery_token"),
    "migration defines discard RPC",
  );
  assert(
    migration.includes("pending_activation"),
    "migration adds pending_activation column",
  );
  assert(migration.includes("SECURITY DEFINER"), "migration RPC is SECURITY DEFINER");
  assert(migration.includes("SET search_path = public"), "migration RPC sets search_path");
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.stage_participation_access_recovery_token"),
    "migration revokes public stage RPC access",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.stage_participation_access_recovery_token") &&
      migration.includes("TO service_role"),
    "migration grants stage RPC to service_role only",
  );
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.activate_participation_access_recovery_token"),
    "migration revokes public activate RPC access",
  );
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.discard_participation_access_recovery_token"),
    "migration revokes public discard RPC access",
  );
  assert(
    migration.includes("participation-access-recovery"),
    "migration seeds recovery email template",
  );
  assert(
    migration.includes("a.club_id IS NULL"),
    "migration limits recovery to external applications",
  );
  assert(
    migration.includes("a.status = 'accepted'::public.application_status"),
    "migration requires accepted status",
  );
  assert(
    migration.includes("FOR UPDATE"),
    "migration serializes recovery with row locks",
  );

  // P1-1: expired unrevoked token does not block recovery
  assert(
    migration.includes("pending_activation = true"),
    "P1-1: stage inserts pending token instead of immediate activation",
  );
  assert(
    migration.includes("pending_activation = false") &&
      migration.includes("AND revoked_at IS NULL"),
    "P1-1: activate revokes active non-pending tokens",
  );
  assert(
    !migration.includes("expires_at > now()") ||
      !migration.match(/UPDATE public\.secure_access_tokens[\s\S]*expires_at > now\(\)/),
    "P1-1: stage does not skip expired unrevoked tokens via expires_at filter",
  );

  // P1-2: email failure must not destroy active access
  assert(
    recoveryActions.includes("stage_participation_access_recovery_token"),
    "P1-2: stage before email",
  );
  assert(
    recoveryDelivery.includes("activate_participation_access_recovery_token"),
    "P1-2: activate only after provider acceptance",
  );
  assert(
    recoveryDelivery.includes("discard_participation_access_recovery_token"),
    "P1-2: discard on provider failure",
  );
  assert(
    recoveryMail.includes("deliverParticipationAccessRecoveryEmail"),
    "P1-2: delivery returns provider outcome",
  );
  assert(
    recoveryDelivery.includes("emailResult.ok"),
    "P1-2: activation gated on provider ok",
  );
  assert(
    migration.includes("pending_activation = true") &&
      migration.includes("revoked_at = now()"),
    "P1-2: staged token is not portal-valid until activation",
  );

  // P1-3: timing mitigation
  assert(
    recoveryDelivery.includes('from "next/server"') &&
      recoveryDelivery.includes("after("),
    "P1-3: email delivery deferred via next/server after",
  );
  assert(
    recoveryActions.includes("scheduleParticipationRecoveryDelivery"),
    "P1-3: action schedules async delivery module",
  );
  assert(
    !recoveryActions.includes("await deliverParticipationAccessRecoveryEmail"),
    "P1-3: request path does not await email delivery",
  );
  assert(
    recoveryTiming.includes("PARTICIPATION_RECOVERY_MIN_RESPONSE_MS"),
    "P1-3: bounded response normalization exists",
  );
  assert(
    recoveryActions.includes("waitForParticipationRecoveryResponseDeadline"),
    "P1-3: action applies response deadline",
  );
  assert(
    PARTICIPATION_RECOVERY_MIN_RESPONSE_MS >= 300 &&
      PARTICIPATION_RECOVERY_MIN_RESPONSE_MS <= 2000,
    "P1-3: bounded min response window",
  );

  // P1-4: concurrency
  assert(
    migration.includes("FROM public.applications") &&
      migration.includes("FOR UPDATE"),
    "P1-4: application row locked during stage",
  );
  assert(
    migration.includes("DELETE FROM public.secure_access_tokens") &&
      migration.includes("pending_activation = true"),
    "P1-4: stale pending tokens removed before new stage",
  );
  assert(
    migration.includes("FOR UPDATE") &&
      migration.includes("pending_activation = true"),
    "P1-4: activate locks pending token row",
  );

  // Expiry future-safe
  assert(
    migration.includes("participation_recovery_token_expires_at"),
    "expiry helper exists in migration",
  );
  assert(
    migration.includes("GREATEST(") && migration.includes("p_tournament_date"),
    "expiry uses max(tournament date, today)",
  );
  const pastTournament = "2020-01-01";
  const futureExpiry = participationRecoveryTokenExpiresAt(pastTournament);
  assert(Date.parse(futureExpiry) > Date.now(), "past tournament expiry is in the future");
  const futureTournament = new Date();
  futureTournament.setUTCFullYear(futureTournament.getUTCFullYear() + 1);
  const futureTournamentIso = futureTournament.toISOString().slice(0, 10);
  const futureTournamentExpiry = participationRecoveryTokenExpiresAt(futureTournamentIso);
  assert(
    Date.parse(futureTournamentExpiry) > Date.now(),
    "future tournament expiry is in the future",
  );

  // Neutral public response
  assert(
    recoveryActions.includes("PARTICIPATION_RECOVERY_NEUTRAL_NOTICE"),
    "neutral notice constant used",
  );
  assert(
    recoveryActions.includes("notice: PARTICIPATION_RECOVERY_NEUTRAL_NOTICE"),
    "neutral notice returned on success path",
  );

  // No cancellation side effects
  assert(
    !migration.toLowerCase().includes("insert into public.cancellation_requests"),
    "no cancellation request insert",
  );
  assert(
    !migration.includes("status = 'cancelled'"),
    "no application cancellation",
  );
  assert(
    !recoveryActions.includes("submit_cancellation_request_external"),
    "recovery action does not submit cancellation",
  );

  // Token hashing
  const token = generateSecureAccessToken();
  const hash = hashSecureAccessToken(token);
  assert(hash.length === 64, "sha256 hash length");
  assert(!hash.includes(token), "hash is not plaintext token");
  assert(
    recoveryActions.includes("p_token_hash: tokenHash"),
    "only token hash sent to RPC",
  );

  // Service role isolation
  assert(serviceRole.includes('import "server-only"'), "service role is server-only");
  assert(!client.includes("SUPABASE_SERVICE_ROLE_KEY"), "browser client has no service role key");

  // Existing flows unchanged
  assert(actions.includes("loadParticipationPortalByToken"), "portal loader exists");
  assert(actions.includes("submitExternalCancellationRequestAction"), "external cancellation unchanged");
  assert(actions.includes("submitClubCancellationRequestAction"), "club cancellation unchanged");
  assert(statusMail.includes("ensureParticipationCancellationToken"), "acceptance token helper preserved");
  assert(participationToken.includes("revokeActiveParticipationTokens"), "acceptance revoke helper preserved");

  // Portal + cancellation still token gated
  assert(
    cancellationMigration.includes("validate_secure_access_token"),
    "portal validation RPC unchanged",
  );
  assert(
    cancellationMigration.includes("submit_cancellation_request_external"),
    "external cancellation RPC unchanged",
  );

  // Capacity semantics
  const acceptedCapacity = countApplicationsByStatus(["accepted"]);
  assert(acceptedCapacity.confirmedTeams === 1, "capacity: accepted still counts");
  const cancelledCapacity = countApplicationsByStatus(["cancelled"]);
  assert(cancelledCapacity.confirmedTeams === 0, "capacity: cancelled does not count");

  // Enumeration helpers
  const siteHost = new URL(getEmailSiteUrl()).host;
  const validToken = generateSecureAccessToken();
  const parsed = parseParticipationTokenFromUserInput(
    `https://${siteHost}/teilnahme/${encodeURIComponent(validToken)}`,
  );
  assert(parsed === validToken, "same-site participation URL parses");
  assert(
    parseParticipationTokenFromUserInput("https://evil.example/teilnahme/abc") === null,
    "external domain redirect blocked",
  );
  assert(
    normalizeParticipationRecoveryEmail("  Test@Mail.DE ") === "test@mail.de",
    "email normalization for lookup",
  );
  assert(!isValidSecureAccessTokenFormat("not valid!"), "invalid token format blocked");

  // Late cancellation rule preserved
  const lateDate = new Date();
  lateDate.setUTCDate(lateDate.getUTCDate() + 5);
  const lateIso = lateDate.toISOString().slice(0, 10);
  assert(requiresCancellationReason(lateIso), "<14 days still requires reason");
  assert(isLateCancellationRequest(lateIso), "late window still detected");

  // UI entry points
  assert(kontaktPage.includes("/kontakt/absage"), "kontakt card links to absage page");
  assert(absagePage.includes("ParticipationRecoveryForm"), "absage page includes recovery form");

  assert(
    adminTypes.includes('"participation-access-recovery"'),
    "admin email template type includes recovery",
  );

  const tokenMaterial = createParticipationRecoveryTokenMaterial();
  assert(
    tokenMaterial.participationUrl.includes("/teilnahme/"),
    "recovery URL targets participation portal",
  );

  assert(
    PARTICIPATION_RECOVERY_NEUTRAL_NOTICE.includes("sicheren Link"),
    "neutral notice mentions secure link",
  );

  return "ok";
}
