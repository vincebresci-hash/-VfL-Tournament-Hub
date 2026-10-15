/**
 * Phase 4b send + staging architecture notes (Hobby Fluid runtime).
 *
 * Confirmed deployment:
 * - Vercel Hobby plan with Fluid Compute ENABLED (plan maxDuration 300s)
 * - `src/app/admin/posteingang/layout.tsx`: maxDuration = 180
 * - `/api/inbox/sync`: maxDuration = 10 (unchanged)
 * - SMTP timeouts: connection 15s / socket 90s / send race 90s
 * - Finalize + uncertain compensation reserve: 20s (SMTP not started if remaining < 110s)
 * - Approved attachment caps: 5 files / 5 MiB / 12 MiB total (+ ~33% MIME)
 *
 * Staging (direct upload):
 * - Browser uploads via Supabase signed upload URL (upsert: false)
 * - Server issues token after RBAC + create RPC + lease for exact structured path
 * - Finalize deadline: 15m from created_at (server-enforced); platform JWT may outlive it
 * - reject_inbox_reply_upload only while status=uploading (H1 concurrent-safe)
 * - No authenticated storage.objects policies; no privileged credentials in the browser
 *
 * Platform kill note:
 * - A hard Vercel termination during SMTP can leave delivery uncertain.
 * - Never auto-resend; use reconcile runbook / ops review.
 *
 * Architecture decision (fail closed for SMTP attachments):
 * - Runtime budget is Hobby-compatible at 180s, but production keeps
 *   `allowAttachmentSend: false` until end-to-end validation.
 */

export const INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES = {
  adminInboxMaxDurationSeconds: 180,
  hobbyFluidMaxDurationSeconds: 300,
  fluidComputeEnabled: true,
  smtpConnectionTimeoutMs: 15_000,
  smtpSocketTimeoutMs: 90_000,
  smtpSendTimeoutMs: 90_000,
  smtpFinalizeReserveMs: 20_000,
  recommendedMaxTotalRawBytes: 12 * 1024 * 1024,
  mimeOverheadFactor: 1.33,
  requiresDedicatedLongerRoute: false,
  directToSupabaseUpload: true,
  noAuthenticatedStoragePolicies: true,
  rejectOnlyWhileUploading: true,
  signedUploadJwtPlatformControlled: true,
  finalizeMaxAgeMs: 15 * 60 * 1000,
  uncertainNeverAutoResend: true,
  platformKillLeavesUncertain: true,
  rejectFileSizeBeforeBuffer: true,
  zipBombResidualClientSideOnly: true,
  quotaAbuseBoundedAccepted: true,
  boundPreviewRequiresInboxView: true,
  attachmentSendEnabledOnCurrentDeployment: false,
  architectureDecision: "HOBBY_FLUID_180S_WAIT_E2E_ENABLE",
} as const;
