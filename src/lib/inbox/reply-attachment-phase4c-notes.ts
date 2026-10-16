/**
 * Phase 4c attachment UI notes (composer preview; SMTP still gated).
 *
 * Staged persistence across remount:
 * - Unmount / message switch / Abbrechen MUST NOT auto-delete `staging` or `bound`.
 * - Auto-abandon uses reject_inbox_reply_upload (uploading only) — race-safe vs finalize.
 * - On remount, listInboxReplyStagingAttachmentsAction restores the actor's staging rows
 *   for the parent message into the composer list (parent/mailbox RLS visibility required).
 *
 * Draft persistence (sessionStorage):
 * - Subject + body only, keyed by authenticated actorId + parentMessageId.
 * - Never stores upload tokens, storage paths, or credentials.
 * - Cleared after successful send or confirmed discard; restored on composer reopen.
 *
 * Attachment SMTP remains disabled (`allowAttachmentSend: false`).
 *
 * Test layers (keep distinct):
 * - node:test pure lifecycle/helpers: `test:inbox-attachment-ui`
 * - vitest+RTL mocked React component tests: `test:inbox-attachment-react`
 *   (panel + composer; Phase 4d M-B)
 * - Real browser/Supabase/SMTP E2E: still pending — see phase4d notes
 *   (`browserE2EPending: true`; isolated env not confirmed)
 */

export const INBOX_REPLY_ATTACHMENT_PHASE4C_NOTES = {
  stagedSurvivesUnmount: true,
  stagedRestoredOnRemount: true,
  autoAbandonOnlyWhileUploading: true,
  listStagingRequiresParentVisibility: true,
  removeFinalizeRaceReconciles: true,
  allowAttachmentSend: false,
  sessionDraftSubjectBodyOnly: true,
  bodyDraftNotServerPersisted: true,
  executableLifecycleTests: true,
  mockedReactComponentTests: true,
  browserE2EPending: true,
} as const;
