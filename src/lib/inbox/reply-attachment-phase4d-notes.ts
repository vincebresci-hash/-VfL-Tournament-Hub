/**
 * Phase 4d — final hardening notes + browser E2E preparation (readiness only).
 *
 * Code remediations in this phase:
 * - M-A: clearScopedReplyComposerDraftAfterSend on successful send (scoped actor+parent),
 *   even if the composer unmounted mid-send.
 * - M-B: InboxReplyComposer.test.tsx (mocked React — not browser E2E).
 * - M-C: decideListStagingAccess shared by listInboxReplyStagingAttachmentsAction + tests.
 * - R1: subject/body refs updated synchronously on edit; clear registry stores fingerprints only.
 *
 * Attachment SMTP remains fail-closed (`allowAttachmentSend: false`).
 */

export const INBOX_REPLY_ATTACHMENT_PHASE4D_NOTES = {
  maDraftClearAfterUnmountSend: true,
  m4d1RemountNoDraftResurrection: true,
  r1SyncComposerRefsOnEdit: true,
  r1FingerprintOnlyClearRegistry: true,
  mbComposerReactTests: true,
  m4d3FailedUncertainPreserveDraft: true,
  mcSharedListStagingAuthz: true,
  m4d2RealPermissionFlagsInListStaging: true,
  allowAttachmentSend: false,
  /**
   * No Playwright project config in-repo. Existing "E2E" is manual KO SQL/UI
   * (`scripts/ko-e2e-test`). Next optionally depends on `@playwright/test` via
   * package-lock peer metadata only — not a configured inbox browser suite.
   */
  playwrightProjectConfigured: false,
  /**
   * Step 2 isolation assessment (read-only):
   * - Known production Supabase project ref: ogopebvpojuvheimzged
   * - Vercel Preview URL for PR head is distinct from production Vercel host,
   *   but Preview JS bundles did not expose a NEXT_PUBLIC_SUPABASE_URL hostname,
   *   and this agent has no read access to Vercel project env vars.
   * - Local agent process has no SUPABASE_* env set.
   * - Verdict remains UNKNOWN — do NOT treat Preview as an isolated test project.
   */
  isolatedTestEnvironmentConfirmed: false,
  previewSupabaseIsolationVerdict: "UNKNOWN" as const,
  knownProductionSupabaseProjectRef: "ogopebvpojuvheimzged",
  realSupabaseUploadTestsAllowed: false,
  browserE2EPending: true,
} as const;

/**
 * Browser E2E test plan (DO NOT EXECUTE against unknown/production-linked envs).
 *
 * Preconditions (must be confirmed by a human before any live run):
 * 1. Dedicated Supabase project (or local `supabase start`) isolated from production.
 * 2. All inbox reply attachment migrations applied (staging bucket private;
 *    no broad storage.objects policies for anon/authenticated).
 * 3. Test mailbox + admin user with inbox.view + inbox.reply only.
 * 4. Env vars for the test runner only:
 *    - NEXT_PUBLIC_SUPABASE_URL / ANON_KEY (test project)
 *    - service_role key only in CI secrets for SQL harness — never in browser
 *    - No production IONOS SMTP credentials in the browser E2E profile
 * 5. `allowAttachmentSend` remains false during UI E2E (gate assertion).
 *
 * Cases:
 * a. Attachment selection + quotas (count/bytes/extension/MIME)
 * b. begin → signed PUT (upsert:false) → object present
 * c. finalize → staging row; path/token never in UI state/logs
 * d. Message switch + remount restores staging via list (parent RLS)
 * e. Remove / retry; remove-during-finalize never silent-hides staged
 * f. Draft restore/clear (actor+parent keys); mid-send switch clears sender draft only
 * g. Authz negatives: no reply perm; invisible parent → list/begin fail closed
 * h. SMTP gate: send disabled while attachments present; no upload ids in send payload
 *
 * Required setup steps (not performed in Phase 4d Step 1):
 * - Provision isolated Supabase + apply migrations
 * - Create test admin + seed one inbox_messages row
 * - Add Playwright config + authenticated storageState fixture
 * - Point Preview or local `next start` at the isolated project only
 * - Obtain written approval before any Storage write tests
 */
export const INBOX_REPLY_ATTACHMENT_PHASE4D_E2E_PLAN = {
  blockedOnIsolatedEnv: true,
  covers: [
    "selection_quotas",
    "signed_direct_upload",
    "server_finalize",
    "message_switch_staged_restore",
    "remove_retry",
    "draft_persistence",
    "authorization_failures",
    "attachment_smtp_gate",
  ],
} as const;
