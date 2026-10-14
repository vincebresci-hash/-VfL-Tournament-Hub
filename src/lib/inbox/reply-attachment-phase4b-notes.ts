/**
 * Phase 4b send architecture notes (Hobby-safe).
 *
 * Vercel Hobby constraints observed for `/admin/posteingang`:
 * - `maxDuration = 10` on the admin inbox layout (server actions share this ceiling).
 * - Current SMTP send timeout is 15s — already tight vs Hobby wall-clock.
 * - Base64 MIME overhead ≈ +33% on attachment bytes.
 * - Platform request body limits still apply; actions reject File.size > 5 MiB before buffering.
 *
 * ZIP/OOXML residual risk (M2): server never fully decompresses; it enforces compressed
 * size + local-header count. Clients that download and expand may still hit bombs.
 *
 * Safe Phase 4b approach (do not implement here):
 * 1. Keep approved caps (5 MiB / file, 12 MiB total, 5 files) so encode+SMTP fits a short window.
 * 2. Prefer a dedicated Node route/action segment with an explicit higher `maxDuration`
 *    only if Preview/Prod plan allows it; otherwise fail closed before SMTP when
 *    estimated MIME size cannot finish within remaining budget.
 * 3. Never auto-retry after uncertain delivery (attachments bound to the same reply).
 * 4. Stream/download via service_role with declared-size checks; abort if bytes ≠ size_bytes.
 * 5. Do not raise limits to IONOS’s larger account caps on Hobby without a duration plan.
 * 6. Never purge bound attachments while reply status is sending/uncertain or retain_until
 *    is in the future (mark_inbox_reply_upload_purged revalidates eligibility).
 */

export const INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES = {
  adminInboxMaxDurationSeconds: 10,
  smtpSendTimeoutMs: 15_000,
  recommendedMaxTotalRawBytes: 12 * 1024 * 1024,
  mimeOverheadFactor: 1.33,
  requiresDedicatedLongerRoute: false,
  uncertainNeverAutoResend: true,
  rejectFileSizeBeforeBuffer: true,
  zipBombResidualClientSideOnly: true,
} as const;
