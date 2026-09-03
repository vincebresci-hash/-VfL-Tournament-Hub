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
  countActiveNonPending,
  simulateOrderA,
  simulateOrderB,
} from "@/lib/cancellations/participation-token-concurrency";
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

function migrateLocksApplicationThenMutates(migration: string) {
  for (const name of [
    "stage_participation_access_recovery_token",
    "activate_participation_access_recovery_token",
    "rotate_participation_cancellation_token",
  ]) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    if (start < 0) {
      return false;
    }
    const body = migration.slice(start, start + 3500);
    if (!body.includes("FROM public.applications") || !body.includes("FOR UPDATE")) {
      return false;
    }
  }

  return true;
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

  // P1-4: concurrency + acceptance race serialization
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
    migration.includes("rotate_participation_cancellation_token"),
    "P1-4: atomic acceptance rotate RPC exists",
  );
  assert(
    participationToken.includes("rotate_participation_cancellation_token"),
    "P1-4: acceptance path uses rotate RPC",
  );
  assert(
    !participationToken.includes("store_secure_access_token"),
    "P1-4: acceptance no longer uses non-atomic store_secure_access_token",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.rotate_participation_cancellation_token") &&
      migration.includes("TO authenticated"),
    "P1-4: rotate granted to authenticated only",
  );
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.rotate_participation_cancellation_token") &&
      migration.includes("FROM PUBLIC, anon"),
    "P1-4: rotate revoked from PUBLIC/anon",
  );
  // Activate lock order: applications before pending token
  const activateFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.activate_participation_access_recovery_token"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.rotate_participation_cancellation_token"),
  );
  assert(
    activateFn.indexOf("FROM public.applications") <
      activateFn.indexOf("pending_activation = true\n  FOR UPDATE"),
    "P1-4: activate locks applications before pending token FOR UPDATE",
  );
  assert(
    migrateLocksApplicationThenMutates(migration),
    "P1-4: stage/activate/rotate all lock applications FOR UPDATE",
  );

  const orderA = simulateOrderA();
  assert(countActiveNonPending(orderA) === 1, "order A: exactly one active non-pending");
  assert(orderA.active?.hash === "acceptance-hash", "order A: acceptance token wins");
  assert(orderA.pending === null, "order A: no pending after rotate");

  const orderB = simulateOrderB();
  assert(countActiveNonPending(orderB) === 1, "order B: exactly one active non-pending");
  assert(orderB.active?.hash === "acceptance-hash", "order B: acceptance token final");
  assert(orderB.pending === null, "order B: no pending after rotate");

  // Expiry volatility + future-safe semantics
  assert(
    migration.includes("participation_recovery_token_expires_at"),
    "expiry helper exists in migration",
  );
  assert(
    /LANGUAGE plpgsql\nSTABLE\nSET search_path = public/.test(
      migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.participation_recovery_token_expires_at"),
        migration.indexOf("REVOKE ALL ON FUNCTION public.participation_recovery_token_expires_at"),
      ),
    ),
    "expiry helper is STABLE (uses now())",
  );
  assert(
    !/LANGUAGE plpgsql\nIMMUTABLE/.test(
      migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.participation_recovery_token_expires_at"),
        migration.indexOf("REVOKE ALL ON FUNCTION public.participation_recovery_token_expires_at"),
      ),
    ),
    "expiry helper is not IMMUTABLE",
  );
  assert(
    migration.includes("GREATEST(") && migration.includes("p_tournament_date"),
    "expiry uses max(tournament date, today)",
  );

  const fixedNow = new Date("2026-09-03T12:00:00.000Z");
  const pastExpiry = participationRecoveryTokenExpiresAt("2020-01-01", fixedNow);
  const todayIso = "2026-09-03";
  const todayExpiry = participationRecoveryTokenExpiresAt(todayIso, fixedNow);
  const futureIso = "2027-06-15";
  const futureExpiry = participationRecoveryTokenExpiresAt(futureIso, fixedNow);
  const minExpiryMs = Date.parse("2026-09-04T12:00:00.000Z");

  assert(Date.parse(pastExpiry) >= minExpiryMs, "past tournament: at least +1 day");
  assert(Date.parse(todayExpiry) > Date.parse(fixedNow.toISOString()), "today tournament: future expiry");
  assert(
    Date.parse(futureExpiry) === Date.parse("2027-07-15T00:00:00.000Z"),
    "future tournament: tournament date + 30 days UTC midnight",
  );
  assert(
    recoveryTiming.includes("GREATEST") === false &&
      recoveryTiming.includes("parsed.getTime() > reference.getTime()"),
    "TS expiry mirrors max(tournament, today) semantics",
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
  assert(
    participationToken.includes("rotate_participation_cancellation_token"),
    "acceptance rotate helper used",
  );

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
