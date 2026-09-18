import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE,
  RECOVERY_RATE_LIMIT,
  RECOVERY_REVOKE_RPC_NAME,
  RECOVERY_RPC_NAME,
} from "@/lib/cancellations/recovery-constants";
import {
  isNonEmptyRecoveryLabel,
  isValidRecoveryEmail,
  normalizeRecoveryEmail,
  normalizeRecoveryLabel,
} from "@/lib/cancellations/recovery-normalize";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260918140000_guest_cancellation_recovery.sql";

export function runGuestCancellationRecoveryChecks() {
  const migration = read(MIGRATION);
  const actions = read("src/lib/cancellations/recovery-actions.ts");
  const mail = read("src/lib/cancellations/recovery-mail.ts");
  const constants = read("src/lib/cancellations/recovery-constants.ts");
  const kontakt = read("src/app/kontakt/page.tsx");
  const teilnahme = read("src/app/teilnahme/[token]/page.tsx");
  const cancellationActions = read("src/lib/cancellations/actions.ts");
  const participationToken = read("src/lib/cancellations/participation-token.ts");
  const guidanceChecks = read(
    "src/lib/cancellations/public-cancellation-guidance-checks.ts",
  );

  // --- Normalization (deterministic, not fuzzy) ---
  assert(
    normalizeRecoveryEmail("  Vince@Example.COM ") === "vince@example.com",
    "email normalization lower+trim",
  );
  assert(
    normalizeRecoveryLabel("  Test Team I ") === "test team i",
    "label normalization lower+trim",
  );
  assert(isValidRecoveryEmail("a@b.de"), "valid email accepted");
  assert(!isValidRecoveryEmail("not-an-email"), "invalid email rejected");
  assert(isNonEmptyRecoveryLabel("Vince Test"), "non-empty label");
  assert(!isNonEmptyRecoveryLabel("   "), "blank label rejected");

  // --- Token hashing conventions preserved ---
  const token = generateSecureAccessToken();
  const hash = hashSecureAccessToken(token);
  assert(hash.length === 64, "token hash length 64");
  assert(/^[0-9a-f]{64}$/.test(hash), "token hash hex");
  assert(!hash.includes(token), "hash does not contain plaintext");
  assert(actions.includes("hashSecureAccessToken"), "action hashes token");
  assert(actions.includes("generateSecureAccessToken"), "action generates token in app");
  assert(
    !migration.includes("encode(gen_random"),
    "migration does not generate plaintext tokens",
  );
  assert(
    migration.includes("p_token_hash") &&
      migration.includes("token_hash") &&
      !/INSERT INTO public\.secure_access_tokens[\s\S]*?VALUES[\s\S]*?gen_random/i.test(
        migration,
      ),
    "migration stores caller-provided hash only",
  );

  // --- Neutral public message ---
  assert(
    constants.includes(GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE),
    "canonical neutral message defined",
  );
  assert(
    actions.includes("GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE"),
    "action returns canonical message",
  );
  assert(
    actions.includes("return publicResult()"),
    "action uses single public result helper",
  );

  // --- Honeypot ---
  assert(actions.includes("honeypot"), "honeypot supported");
  assert(
    /honeypot[\s\S]{0,120}return publicResult\(\)/.test(actions) ||
      actions.includes('if (honeypot)'),
    "honeypot short-circuits to neutral",
  );

  // --- No cancellation_requests creation ---
  assert(
    !actions.includes('.from("cancellation_requests")') &&
      !actions.includes("INSERT INTO public.cancellation_requests"),
    "recovery action does not write cancellation_requests",
  );
  assert(
    actions.includes("Never creates cancellation_requests"),
    "action documents no cancellation_requests creation",
  );
  assert(
    !migration.includes("INSERT INTO public.cancellation_requests"),
    "migration does not insert cancellation_requests",
  );
  assert(
    !mail.includes('.from("cancellation_requests")'),
    "recovery mail does not create cancellation requests",
  );

  // --- No public application_id ---
  assert(
    !actions.includes("applicationId") && !actions.includes("application_id"),
    "no application_id input/output in recovery action",
  );
  assert(
    !migration.includes("p_application_id"),
    "recovery RPC does not accept application_id",
  );

  // --- Guest-only accepted match ---
  assert(migration.includes("a.club_id IS NULL"), "guest-only club_id IS NULL");
  assert(
    migration.includes("status = 'accepted'::public.application_status"),
    "accepted-only eligibility",
  );
  assert(migration.includes("archived_at IS NULL"), "excludes archived apps");
  assert(
    migration.includes("lower(btrim(a.contact_email))") &&
      migration.includes("lower(btrim(a.club_name))") &&
      migration.includes("lower(btrim(a.team_name))"),
    "normalized equality on email/club/team",
  );
  assert(
    migration.includes("v_match_count IS DISTINCT FROM 1"),
    "requires exactly one match",
  );
  assert(
    !migration.includes("LIKE ") && !migration.includes("ILIKE "),
    "no fuzzy LIKE matching",
  );

  // --- Multi-team: team_name distinguishes ---
  assert(
    migration.includes("lower(btrim(a.team_name)) = v_team"),
    "team_name required in match",
  );

  // --- Token purpose reuse ---
  assert(
    migration.includes("'cancellation'::public.secure_access_token_purpose"),
    "reuses cancellation purpose",
  );
  assert(
    !migration.includes("ALTER TYPE public.secure_access_token_purpose"),
    "no new token purpose",
  );

  // --- Atomic rotation ---
  assert(
    migration.includes("UPDATE public.secure_access_tokens") &&
      migration.includes("INSERT INTO public.secure_access_tokens"),
    "atomic revoke+insert in recovery RPC",
  );
  assert(
    migration.includes("WHERE application_id = v_app.id"),
    "rotation scoped to matched application",
  );
  assert(migration.includes("EXCEPTION"), "fail-closed exception handler");
  assert(
    migration.includes("should_send := false"),
    "exception path returns should_send false",
  );

  // --- Token expiry ---
  assert(
    migration.includes("+ interval '30 days'"),
    "preserves tournament+30d expiry semantics",
  );

  // --- Rate limits (check THEN record; COUNT(*) >= max ⇒ exactly max allowed) ---
  assert(
    migration.includes(RECOVERY_RATE_LIMIT.emailAction),
    "email rate-limit action type",
  );
  assert(
    migration.includes(RECOVERY_RATE_LIMIT.tournamentEmailAction),
    "tournament+email rate-limit action type",
  );
  assert(
    migration.includes(RECOVERY_RATE_LIMIT.ipAction),
    "ip rate-limit action type",
  );
  assert(
    migration.includes("is_public_action_rate_limited") &&
      migration.includes("record_public_action_attempt"),
    "reuses public_action_attempts helpers",
  );
  assert(migration.includes("interval '1 hour'"), "hourly rate-limit window");
  assert(
    migration.includes("guest_cancellation_recovery_email',\n    v_email_key,\n    3,"),
    "email max=3 ⇒ attempts 1–3 allowed, 4 blocked",
  );
  assert(
    migration.includes(
      "guest_cancellation_recovery_tournament_email',\n    v_combo_key,\n    5,",
    ),
    "tournament+email max=5 ⇒ attempts 1–5 allowed, 6 blocked",
  );
  assert(
    migration.includes("guest_cancellation_recovery_ip',\n       v_ip_key,\n       10,"),
    "ip max=10 ⇒ attempts 1–10 allowed, 11 blocked",
  );

  const firstCheckIdx = migration.indexOf("is_public_action_rate_limited(");
  const firstRecordIdx = migration.indexOf("record_public_action_attempt(");
  assert(
    firstCheckIdx >= 0 &&
      firstRecordIdx >= 0 &&
      firstCheckIdx < firstRecordIdx,
    "rate-limit CHECK appears before RECORD",
  );
  assert(
    migration.includes("CHECK then RECORD") ||
      migration.includes("Check then RECORD") ||
      migration.includes("CHECK then RECORD (COUNT(*) >= max)"),
    "documents check-then-record semantics",
  );
  assert(
    migration.includes(
      "Count this request even if identity ultimately does not match",
    ),
    "no-match attempts still recorded after check passes",
  );
  assert(
    actions.includes("hashRateLimitIdentifier"),
    "rate-limit keys hashed in app",
  );

  // Base helper semantics (existing): COUNT(*) >= max
  const baseCancellationMigration = read(
    "supabase/migrations/20260829160000_cancellation_requests.sql",
  );
  assert(
    baseCancellationMigration.includes("COUNT(*)::integer >= p_max_attempts"),
    "base helper uses COUNT >= max",
  );
  const submitFnStart = baseCancellationMigration.indexOf(
    "CREATE OR REPLACE FUNCTION public.submit_cancellation_request_external",
  );
  const submitSlice = baseCancellationMigration.slice(submitFnStart, submitFnStart + 2500);
  assert(
    submitSlice.includes("is_public_action_rate_limited") &&
      submitSlice.includes("record_public_action_attempt") &&
      submitSlice.indexOf("is_public_action_rate_limited") <
        submitSlice.indexOf("record_public_action_attempt"),
    "existing cancellation_submit uses check-then-record",
  );

  // Email failure: accepted fail-closed (design D) — revoke new hash; do not restore old
  assert(
    actions.includes("email_failed_revoking_token") &&
      actions.includes("revoke_secure_access_token_by_hash"),
    "email failure revokes newly minted token hash",
  );
  assert(
    actions.includes("Accepted fail-closed tradeoff") ||
      migration.includes("Email-failure tradeoff (accepted)"),
    "documents accepted email-failure token tradeoff",
  );
  assert(
    !actions.includes("revoked_at = null") &&
      !actions.includes('revoked_at: null') &&
      !migration.includes("revoked_at = NULL"),
    "does not restore revoked old tokens on email failure",
  );

  // --- Grants: service_role only; no anon ---
  assert(migration.includes(RECOVERY_RPC_NAME), "recovery RPC present");
  assert(migration.includes(RECOVERY_REVOKE_RPC_NAME), "revoke RPC present");
  assert(
    migration.includes(
      `GRANT EXECUTE ON FUNCTION public.${RECOVERY_RPC_NAME}(\n  uuid, text, text, text, text, text, text, text\n) TO service_role;`,
    ) ||
      migration.includes("TO service_role"),
    "recovery RPC granted to service_role",
  );
  assert(
    migration.includes("FROM anon") && migration.includes("FROM authenticated"),
    "recovery RPC revoked from anon/authenticated",
  );
  assert(
    !migration.includes("GRANT SELECT ON TABLE public.applications"),
    "no applications SELECT grant",
  );
  assert(
    !migration.includes("GRANT INSERT ON TABLE public.secure_access_tokens") &&
      !migration.includes("GRANT UPDATE ON TABLE public.secure_access_tokens") &&
      !migration.includes("GRANT SELECT ON TABLE public.secure_access_tokens TO anon"),
    "no broad secure_access_tokens grants",
  );
  assert(
    !/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*cancellation_requests/i.test(
      migration,
    ),
    "no cancellation_requests table grants",
  );
  assert(!migration.includes("CREATE POLICY"), "no RLS policy changes");
  assert(
    actions.includes("createServiceRoleClient"),
    "action uses service role client",
  );
  assert(
    !actions.includes('rpc(\n    "issue_guest_cancellation_recovery_token"') ||
      actions.includes("createServiceRoleClient"),
    "RPC not called via anon client",
  );

  // --- Email: stored contact_email only ---
  assert(
    actions.includes("sendGuestCancellationRecoveryEmail"),
    "recovery email helper used",
  );
  assert(
    actions.includes("storedEmail") &&
      actions.includes("normalizeRecoveryEmail(storedEmail)"),
    "emails only after stored email equality check",
  );
  assert(
    mail.includes("Teilnahme verwalten") && mail.includes("participationUrl"),
    "email contains participation CTA",
  );
  assert(
    !mail.includes("application.id") && !mail.includes("application_id"),
    "email has no application UUID",
  );
  assert(
    actions.includes("revoke_secure_access_token_by_hash"),
    "email failure revokes token",
  );

  // --- Existing flows untouched ---
  assert(
    !teilnahme.includes("requestGuestCancellationRecovery"),
    "/teilnahme unchanged by recovery action",
  );
  assert(
    cancellationActions.includes("submitExternalCancellationRequestAction"),
    "external cancellation action preserved",
  );
  assert(
    participationToken.includes("ensureParticipationCancellationToken"),
    "acceptance token helper preserved",
  );
  assert(
    kontakt.includes("Teilnahme absagen") && !kontakt.includes("<form"),
    "PR-C1 /kontakt remains guidance-only",
  );
  assert(
    guidanceChecks.includes("no public cancellation form"),
    "PR-C1 guidance checks unchanged",
  );
  assert(
    !kontakt.includes("requestGuestCancellationRecoveryAction"),
    "/kontakt does not wire recovery action yet",
  );

  // --- Expiry / purpose documentation anchors ---
  assert(
    migration.includes("SECURITY DEFINER") &&
      migration.includes("SET search_path = public"),
    "SECURITY DEFINER with locked search_path",
  );

  return "ok";
}
