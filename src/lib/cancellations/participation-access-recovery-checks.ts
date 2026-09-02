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
  const recoveryMail = read("src/lib/cancellations/participation-recovery-mail.ts");
  const actions = read("src/lib/cancellations/actions.ts");
  const participationToken = read("src/lib/cancellations/participation-token.ts");
  const cancellationMigration = read(
    "supabase/migrations/20260829160000_cancellation_requests.sql",
  );
  const serviceRole = read("src/lib/supabase/service-role.ts");
  const client = read("src/lib/supabase/client.ts");
  const kontaktPage = read("src/app/kontakt/page.tsx");
  const absagePage = read("src/app/kontakt/absage/page.tsx");
  const recoveryForm = read("src/components/cancellation/ParticipationRecoveryForm.tsx");
  const existingLinkForm = read("src/components/cancellation/ExistingParticipationLinkForm.tsx");
  const statusMail = read("src/lib/email/status-mail.ts");
  const adminTypes = read("src/types/admin.ts");

  // Migration safety
  assert(
    migration.includes("issue_participation_access_recovery_token"),
    "migration defines recovery RPC",
  );
  assert(migration.includes("SECURITY DEFINER"), "migration RPC is SECURITY DEFINER");
  assert(migration.includes("SET search_path = public"), "migration RPC sets search_path");
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.issue_participation_access_recovery_token"),
    "migration revokes public RPC access",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.issue_participation_access_recovery_token") &&
      migration.includes("TO service_role"),
    "migration grants RPC to service_role only",
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
    migration.includes("participation_recovery_email") &&
      migration.includes("participation_recovery_ip") &&
      migration.includes("participation_recovery_app"),
    "migration defines rate limit buckets",
  );
  assert(
    !migration.includes("cancellation_requests") ||
      !migration.toLowerCase().includes("insert into public.cancellation_requests"),
    "migration does not create cancellation requests",
  );
  assert(
    !migration.includes("status = 'cancelled'"),
    "migration does not cancel applications",
  );

  // A: neutral public response
  assert(
    recoveryActions.includes("PARTICIPATION_RECOVERY_NEUTRAL_NOTICE"),
    "A: action uses neutral notice constant",
  );
  assert(
    recoveryActions.includes("notice: PARTICIPATION_RECOVERY_NEUTRAL_NOTICE"),
    "A: action returns neutral notice on success path",
  );
  assert(
    recoveryActions.includes('console.error("issue_participation_access_recovery_token failed"'),
    "A: RPC errors still return neutral response",
  );

  // B-D: recovery alone does not mutate cancellation workflow
  assert(
    !recoveryActions.includes("submit_cancellation_request_external"),
    "B: recovery action does not submit cancellation",
  );
  assert(
    !recoveryActions.includes("cancellation_requests"),
    "B: recovery action does not touch cancellation_requests",
  );
  assert(
    !recovery.includes("submitExternalCancellationRequestAction"),
    "recovery helper does not call external cancellation",
  );
  assert(
    recoveryActions.includes('createServiceRoleClient()'),
    "recovery uses server-only service role path",
  );

  // E: valid recovery reaches existing portal
  const tokenMaterial = createParticipationRecoveryTokenMaterial();
  assert(
    tokenMaterial.participationUrl.includes("/teilnahme/"),
    "E: recovery URL targets participation portal",
  );
  assert(
    actions.includes("loadParticipationPortalByToken"),
    "E: existing portal loader remains",
  );
  assert(absagePage.includes("ParticipationRecoveryForm"), "E: absage page includes recovery form");

  // F: cancellation still requires valid token
  assert(
    actions.includes("submitExternalCancellationRequestAction"),
    "F: external cancellation action unchanged",
  );
  assert(
    cancellationMigration.includes("submit_cancellation_request_external"),
    "F: external cancellation RPC unchanged in base migration",
  );

  // G: late cancellation rule preserved
  const lateDate = new Date();
  lateDate.setUTCDate(lateDate.getUTCDate() + 5);
  const lateIso = lateDate.toISOString().slice(0, 10);
  assert(requiresCancellationReason(lateIso), "G: <14 days still requires reason");
  assert(isLateCancellationRequest(lateIso), "G: late window still detected");

  // H: admin approval still required
  assert(actions.includes("decideCancellationRequestAction"), "H: admin decide action exists");
  assert(
    cancellationMigration.includes("decide_cancellation_request"),
    "H: decide RPC exists",
  );

  // I: no auto waitlist promotion
  assert(
    !migration.toLowerCase().includes("waiting-list") ||
      !migration.toLowerCase().includes("promot"),
    "I: no waitlist promotion in recovery migration",
  );

  // J: rate limits exist
  assert(
    recovery.includes("buildParticipationRecoveryRateLimitHashes"),
    "J: client-side rate limit hash builder exists",
  );
  assert(
    recoveryActions.includes("emailIdentifierHash") &&
      recoveryActions.includes("ipIdentifierHash"),
    "J: action passes rate limit hashes to RPC",
  );

  // K: token plaintext not stored
  const token = generateSecureAccessToken();
  const hash = hashSecureAccessToken(token);
  assert(hash.length === 64, "K: sha256 hash length");
  assert(!hash.includes(token), "K: hash is not plaintext token");
  assert(
    recoveryActions.includes("p_token_hash: tokenHash"),
    "K: only token hash sent to RPC",
  );
  assert(
    !migration.includes("token_hash text") || migration.includes("p_token_hash"),
    "K: migration stores hash parameter only",
  );

  // L: no service role secret exposure
  assert(serviceRole.includes('import "server-only"'), "L: service role is server-only");
  assert(!client.includes("SUPABASE_SERVICE_ROLE_KEY"), "L: browser client has no service role key");
  assert(
    !recoveryForm.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      !existingLinkForm.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "L: UI does not reference service role key",
  );

  // M: club cancellation unchanged
  assert(
    actions.includes("submitClubCancellationRequestAction"),
    "M: club cancellation action unchanged",
  );
  assert(
    !recoveryActions.includes("submitClubCancellationRequestAction"),
    "M: recovery does not alter club cancellation",
  );
  assert(absagePage.includes("/login?redirect=%2Fverein%2Fbewerbungen"), "M: club path links to login");

  // N: acceptance/status emails unchanged
  assert(statusMail.includes("ensureParticipationCancellationToken"), "N: status mail token helper preserved");
  assert(
    !statusMail.includes("sendParticipationAccessRecoveryEmail"),
    "N: status mail does not send recovery email",
  );
  assert(
    recoveryMail.includes("participation-access-recovery"),
    "N: recovery uses distinct template type",
  );
  assert(
    !recoveryMail.includes("application-accepted"),
    "N: recovery mail is not acceptance mail",
  );
  assert(
    !recoveryMail.includes("abgesagt") && !recoveryMail.includes("Absage bestätigt"),
    "N: recovery mail does not claim cancellation",
  );

  // UI entry points
  assert(kontaktPage.includes("/kontakt/absage"), "kontakt card links to absage page");
  assert(kontaktPage.includes("Teilnahme absagen"), "kontakt card copy present");
  assert(kontaktPage.includes("Absage anfragen"), "kontakt CTA present");
  assert(absagePage.includes("Gastbewerbung"), "absage page external path");
  assert(absagePage.includes("ExistingParticipationLinkForm"), "optional existing link fallback");

  // Enumeration protection
  assert(
    recovery.includes("parseParticipationTokenFromUserInput"),
    "existing link parser exists",
  );
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

  // Capacity semantics unchanged
  const acceptedCapacity = countApplicationsByStatus(["accepted"]);
  assert(acceptedCapacity.confirmedTeams === 1, "capacity: accepted still counts");
  const cancelledCapacity = countApplicationsByStatus(["cancelled"]);
  assert(cancelledCapacity.confirmedTeams === 0, "capacity: cancelled does not count");

  // Email template type registered
  assert(
    adminTypes.includes('"participation-access-recovery"'),
    "admin email template type includes recovery",
  );

  // Participation token reuse semantics
  assert(
    participationToken.includes("revokeActiveParticipationTokens"),
    "existing token rotation helper preserved",
  );
  assert(
    migration.includes("revoked_at = now()"),
    "migration revokes previous active tokens",
  );

  // Neutral notice wording
  assert(
    PARTICIPATION_RECOVERY_NEUTRAL_NOTICE.includes("sicheren Link"),
    "neutral notice mentions secure link without leaking data",
  );
  assert(
    !PARTICIPATION_RECOVERY_NEUTRAL_NOTICE.toLowerCase().includes("token"),
    "neutral notice avoids token wording",
  );

  // Invalid token format guard for existing link
  assert(!isValidSecureAccessTokenFormat("not valid!"), "invalid token format blocked");

  return "ok";
}
