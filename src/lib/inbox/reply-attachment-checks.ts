import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS,
  INBOX_REPLY_ATTACHMENT_MAX_COUNT,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES,
  INBOX_REPLY_ATTACHMENT_QUOTA_ABUSE_NOTE,
} from "@/lib/inbox/reply-attachment-limits";
import { INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES } from "@/lib/inbox/reply-attachment-phase4b-notes";
import {
  assertInboxReplyStoragePathBinding,
  decideFinalizeCommitCleanup,
  parseInboxReplyStoragePath,
} from "@/lib/inbox/reply-attachment-path";
import {
  INBOX_REPLY_ATTACHMENT_MIN_DURATION_SECONDS,
  INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS,
  INBOX_REPLY_MIN_REMAINING_MS_BEFORE_SMTP,
  INBOX_REPLY_PLATFORM_KILL_UNCERTAIN_NOTE,
  INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS,
  INBOX_SMTP_CONNECTION_TIMEOUT_MS,
  INBOX_SMTP_SEND_TIMEOUT_MS,
  INBOX_SMTP_SOCKET_TIMEOUT_MS,
  canStartInboxReplySmtp,
  evaluateInboxReplyAttachmentRuntimeBudget,
} from "@/lib/inbox/reply-attachment-runtime";
import {
  assertDirectUploadAuthorizationBinding,
} from "@/lib/inbox/reply-attachment-direct-upload";
import {
  composerAttachmentsBlockSend,
  resolveInboxReplyAttachmentContentType,
  validateComposerAttachmentSelection,
} from "@/lib/inbox/reply-attachment-composer";
import {
  INBOX_REPLY_ZIP_BOMB_RESIDUAL_RISK,
  assertReplyAttachmentDeclaredSize,
  countZipLocalHeaders,
  isValidOoxmlStructure,
  looksLikeActiveReplyAttachmentContent,
  validateInboxReplyAttachmentBytes,
  validateInboxReplyAttachmentMeta,
} from "@/lib/inbox/reply-attachment-validation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function minimalPdf(): Buffer {
  return Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
}

function minimalPng(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

function minimalJpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
}

function minimalOoxml(kind: "docx" | "xlsx", withXmlDecl = false): Buffer {
  const folder = kind === "docx" ? "word/" : "xl/";
  const xml = withXmlDecl ? "<?xml version=\"1.0\"?>" : "";
  const payload = `PK\u0003\u0004dummy[Content_Types].xml${xml}${folder}document.xmlPK\u0005\u0006`;
  return Buffer.from(payload, "binary");
}

export function runInboxReplyAttachmentChecks() {
  const migrationPath = "supabase/migrations/20261014200000_inbox_reply_attachment_staging.sql";
  assert(existsSync(join(process.cwd(), migrationPath)), "Phase 4a migration exists");
  const migration = read(migrationPath);
  const remediation = read(
    "supabase/migrations/20261014220000_inbox_reply_attachment_audit_remediation.sql",
  );
  const phase4bMigration = read(
    "supabase/migrations/20261014210000_inbox_reply_attachment_send.sql",
  );
  const actions = read("src/lib/inbox/actions.ts");
  const attachmentActions = read("src/lib/inbox/reply-attachment-actions.ts");
  const directUpload = read("src/lib/inbox/reply-attachment-direct-upload.ts");
  const sendCore = read("src/lib/inbox/reply-send.ts");
  const sendAction = read("src/lib/inbox/reply-send-action.ts");
  const composerUi = read("src/components/admin/inbox/InboxReplyComposer.tsx");
  const sync = read("src/lib/inbox/sync.ts");
  const detailUi = read("src/components/admin/InboxMessageDetail.tsx");
  const layout = read("src/app/admin/posteingang/layout.tsx");

  // --- Migration contracts ---
  assert(migration.includes("inbox-reply-attachments"), "private outbound bucket");
  assert(migration.includes("Intentionally no storage.objects policies"), "no broad Storage policies");
  assert(remediation.includes("AND status = 'uploading'"), "H1 reject only uploading");
  assert(remediation.includes("Never mutates staging/bound"), "H1 comment");
  assert(
    phase4bMigration.includes("AND upload.created_by = v_uid\n      AND upload.parent_message_id = v_parent.id\n      AND upload.mailbox_id = v_parent.mailbox_id\n    FOR UPDATE"),
    "M2 owner-scoped FOR UPDATE",
  );

  // --- Direct upload wiring ---
  assert(actions.includes("beginInboxReplyAttachmentUploadAction"), "begin upload action exported");
  assert(actions.includes("finalizeInboxReplyAttachmentUploadAction"), "finalize upload action exported");
  assert(!actions.includes("uploadInboxReplyAttachmentAction"), "legacy FormData upload removed");
  assert(attachmentActions.includes("createSignedUploadUrl"), "signed upload URL issued");
  assert(attachmentActions.includes("upsert: false"), "signed upload no upsert");
  assert(attachmentActions.includes("assertInboxReplyStoragePathBinding"), "structured path binding");
  assert(attachmentActions.includes("rejectUploadingAndDeleteStorage"), "H1 safe reject helper");
  assert(attachmentActions.includes("decideFinalizeCommitCleanup"), "H1 commit cleanup decision");
  assert(attachmentActions.includes("finalizeDeadlineMs"), "server finalize deadline");
  assert(!attachmentActions.includes("expiresInSeconds"), "no misleading signed-upload TTL field");
  assert(!attachmentActions.includes("verifyStoredObjectSize"), "M3 list metadata not required");
  assert(attachmentActions.includes("download("), "finalize downloads via service_role");
  assert(
    !attachmentActions.includes("formData.get") && !attachmentActions.includes("FormData"),
    "no FormData upload path",
  );
  assert(attachmentActions.includes("Intentional: any inbox.view"), "bound preview policy documented");
  assert(directUpload.includes("uploadInboxReplyAttachmentToSignedUrl"), "client PUT helper");
  assert(!directUpload.includes("createServiceRoleClient"), "client helper no service client");
  assert(INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS === 15 * 60 * 1000, "finalize max age 15m");
  assert(INBOX_REPLY_ATTACHMENT_QUOTA_ABUSE_NOTE.includes("bounded"), "M4 quota abuse documented");

  // --- Path helpers ---
  const goodPath =
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/plan.pdf";
  assert(parseInboxReplyStoragePath(goodPath)?.filename === "plan.pdf", "path parse ok");
  assert(
    assertInboxReplyStoragePathBinding(goodPath, {
      parentMessageId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      uploadId: "44444444-4444-4444-8444-444444444444",
      filename: "plan.pdf",
    }),
    "structured binding accepts",
  );
  assert(
    !assertInboxReplyStoragePathBinding(goodPath, {
      parentMessageId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      uploadId: "44444444-4444-4444-8444-444444444444",
      filename: "other.pdf",
    }),
    "structured binding rejects filename mismatch",
  );
  assert(
    !assertInboxReplyStoragePathBinding(
      "mb/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/plan.pdf",
      {
        parentMessageId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        uploadId: "44444444-4444-4444-8444-444444444444",
      },
    ),
    "non-uuid mailbox rejected",
  );
  // Substring trap: actor id appearing only inside filename must not pass.
  assert(
    !assertInboxReplyStoragePathBinding(
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/44444444-4444-4444-8444-444444444444/x-33333333-3333-4333-8333-333333333333.pdf",
      {
        parentMessageId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        uploadId: "44444444-4444-4444-8444-444444444444",
      },
    ),
    "substring actor in filename must not bind",
  );

  // --- H1 cleanup decisions ---
  assert(decideFinalizeCommitCleanup({ commitOk: true, statusAfterCommit: "staging" }).action === "success", "commit ok");
  assert(
    decideFinalizeCommitCleanup({ commitOk: false, statusAfterCommit: "staging" }).action ===
      "idempotent_staging",
    "lost race → idempotent staging",
  );
  assert(
    decideFinalizeCommitCleanup({ commitOk: false, statusAfterCommit: "bound" }).action ===
      "idempotent_staging",
    "commit failure after bind → no delete",
  );
  assert(
    decideFinalizeCommitCleanup({ commitOk: false, statusAfterCommit: "uploading" }).action ===
      "reject_and_delete_if_uploading",
    "still uploading → reject",
  );
  assert(
    decideFinalizeCommitCleanup({ commitOk: false, statusAfterCommit: "rejected" }).action ===
      "abort_no_delete",
    "other status → no delete",
  );
  assert(sendAction.includes("maxDuration=180"), "send action documents maxDuration 180");
  assert(!sendAction.includes("maxDuration=90"), "stale maxDuration=90 comment removed");

  // --- Runtime / Hobby Fluid ---
  assert(layout.includes("maxDuration = 180"), "inbox segment maxDuration 180");
  assert(INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS === 180, "runtime constant 180");
  assert(INBOX_REPLY_ATTACHMENT_MIN_DURATION_SECONDS === 120, "min duration for attach send");
  assert(INBOX_SMTP_CONNECTION_TIMEOUT_MS === 15_000, "SMTP connection 15s");
  assert(INBOX_SMTP_SOCKET_TIMEOUT_MS === 90_000, "SMTP socket 90s");
  assert(INBOX_SMTP_SEND_TIMEOUT_MS === 90_000, "SMTP send 90s");
  assert(INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS === 20_000, "finalize reserve 20s");
  assert(
    INBOX_REPLY_MIN_REMAINING_MS_BEFORE_SMTP === 110_000,
    "min remaining before SMTP = send+reserve",
  );
  assert(
    INBOX_SMTP_SEND_TIMEOUT_MS + INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS <
      INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS * 1000,
    "SMTP+finalize under function deadline",
  );
  assert(INBOX_REPLY_PLATFORM_KILL_UNCERTAIN_NOTE.includes("uncertain"), "platform kill documented");
  assert(
    evaluateInboxReplyAttachmentRuntimeBudget({
      attachmentCount: 1,
      totalBytes: 0,
      allowAttachmentSend: false,
    }).ok === false,
    "production fail-closed without allowAttachmentSend",
  );
  assert(
    evaluateInboxReplyAttachmentRuntimeBudget({
      attachmentCount: 1,
      totalBytes: 1024,
      allowAttachmentSend: true,
      deploymentMaxDurationSeconds: 180,
    }).ok === true,
    "opt-in allowed at 180s",
  );
  assert(
    evaluateInboxReplyAttachmentRuntimeBudget({
      attachmentCount: 1,
      totalBytes: INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES + 1,
      allowAttachmentSend: true,
      deploymentMaxDurationSeconds: 180,
    }).ok === false,
    "M6 actual oversized total rejected",
  );
  assert(
    canStartInboxReplySmtp({
      startedAtMs: 0,
      nowMs: 50_000,
      deploymentMaxDurationSeconds: 180,
    }) === true,
    "budget allows SMTP early",
  );
  assert(
    canStartInboxReplySmtp({
      startedAtMs: 0,
      nowMs: 80_000,
      deploymentMaxDurationSeconds: 180,
    }) === false,
    "budget blocks SMTP late",
  );
  assert(sendCore.includes("canStartInboxReplySmtp"), "send gates SMTP on remaining budget");
  assert(sendCore.includes("totalBytes: 0"), "early budget skips max-size placeholder");

  // --- Phase 4b/4c gates ---
  assert(sendCore.includes("normalizeInboxReplyAttachmentRefs"), "upload id normalize");
  const attachmentPanel = read("src/components/admin/inbox/InboxReplyAttachmentPanel.tsx");
  const composerHelpers = read("src/lib/inbox/reply-attachment-composer.ts");
  assert(composerUi.includes("InboxReplyAttachmentPanel"), "Phase 4c panel in composer");
  assert(composerUi.includes("composerAttachmentsBlockSend"), "Phase 4c send unavailable with attachments");
  assert(attachmentPanel.includes("beginInboxReplyAttachmentUploadAction"), "panel begin-wired");
  assert(attachmentPanel.includes("finalizeInboxReplyAttachmentUploadAction"), "panel finalize-wired");
  assert(attachmentPanel.includes("uploadInboxReplyAttachmentToSignedUrl"), "panel PUT-wired");
  assert(attachmentPanel.includes("generationRef"), "stale upload generation guard");
  assert(attachmentPanel.includes("abandonUnfinishedInboxReplyAttachmentAction"), "H1 abandon unfinished only");
  assert(attachmentPanel.includes("decideUnmountAutoCleanup"), "H1 unmount decision helper");
  assert(attachmentPanel.includes("decideStaleFinalizeOutcome"), "H1 stale finalize decision");
  assert(attachmentPanel.includes("listInboxReplyStagingAttachmentsAction"), "staged restore on remount");
  assert(attachmentPanel.includes("decideRemoveAfterAbandon"), "M2 remove/finalize reconcile");
  assert(attachmentPanel.includes("decideRemoveAfterStagingRemove"), "M2 staging remove follow-up");
  assert(attachmentPanel.includes("reconcileAsStaged"), "M2 never silent-hide staged");
  assert(attachmentPanel.includes("aria-live"), "M2 status live region");
  assert(attachmentPanel.includes("Schritt"), "M1 step labels not byte percent");
  assert(!attachmentPanel.includes("aria-valuenow"), "M1 no misleading percent progressbar");
  assert(attachmentPanel.includes("abortByLocalIdRef"), "LOW abort controllers in ref");
  assert(composerUi.includes("window.confirm"), "M3 discard confirmation");
  assert(composerUi.includes("clearReplyComposerDraft"), "draft cleared on discard/send");
  assert(composerUi.includes("readReplyComposerDraft"), "draft restored on open");
  assert(composerUi.includes("actorId"), "draft keyed by actor");
  assert(composerHelpers.includes("attachments_runtime_budget"), "maps server gate error");
  assert(composerHelpers.includes("cleanupPending"), "M4 cleanupPending quota field");
  assert(actions.includes("abandonUnfinishedInboxReplyAttachmentAction"), "abandon action exported");
  assert(actions.includes("listInboxReplyStagingAttachmentsAction"), "list staging action exported");
  assert(
    attachmentActions.includes("listInboxReplyStagingAttachmentsAction") &&
      attachmentActions.includes('from("inbox_messages")') &&
      attachmentActions.includes('errorCode: "parent_not_found"'),
    "M1 listStaging parent visibility gate",
  );
  assert(
    attachmentActions.includes("Never returns storage_path or signed tokens") ||
      attachmentActions.includes("never exposes storage_path"),
    "M1 list never returns paths/tokens",
  );
  assert(!sync.includes("inbox_reply_uploads"), "IMAP sync isolation");
  assert(detailUi.includes('sandbox="allow-popups allow-popups-to-escape-sandbox"'), "sandbox preserved");
  assert(sendAction.includes("allowAttachmentSend: false"), "SMTP attachment send remains false");
  const phase4cNotes = read("src/lib/inbox/reply-attachment-phase4c-notes.ts");
  assert(phase4cNotes.includes("stagedSurvivesUnmount: true"), "4c staged survives unmount");
  assert(phase4cNotes.includes("listStagingRequiresParentVisibility: true"), "M1 documented");
  assert(phase4cNotes.includes("removeFinalizeRaceReconciles: true"), "M2 documented");
  assert(phase4cNotes.includes("sessionDraftSubjectBodyOnly: true"), "draft persistence documented");
  assert(phase4cNotes.includes("mockedReactComponentTests: true"), "M3 React tests documented");
  assert(phase4cNotes.includes("browserE2EPending: true"), "browser E2E gap documented");
  const draftHelper = read("src/lib/inbox/reply-composer-draft.ts");
  assert(draftHelper.includes("Never stores upload tokens"), "draft no tokens");
  assert(draftHelper.includes("buildReplyComposerDraftStorageKey"), "draft key helper");
  assert(existsSync(join(process.cwd(), "src/components/admin/inbox/InboxReplyAttachmentPanel.test.tsx")), "M3 React test file");

  assert(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES === 5 * 1024 * 1024, "5 MiB per file");
  assert(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES === 12 * 1024 * 1024, "12 MiB total");
  assert(INBOX_REPLY_ATTACHMENT_MAX_COUNT === 5, "5 files max");
  assert(
    INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.architectureDecision ===
      "HOBBY_FLUID_180S_WAIT_E2E_ENABLE",
    "architecture decision documented",
  );
  assert(
    INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.attachmentSendEnabledOnCurrentDeployment === false,
    "attachment send disabled",
  );
  assert(
    INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.rejectOnlyWhileUploading === true,
    "H1 documented",
  );
  assert(
    INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.platformKillLeavesUncertain === true,
    "platform kill note",
  );
  assert(INBOX_REPLY_ZIP_BOMB_RESIDUAL_RISK.includes("ZIP bombs"), "M5 residual string");

  const goodAuth = {
    uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
    bucket: "inbox-reply-attachments",
    path: "mb/msg/user/550e8400-e29b-41d4-a716-4466554400aa/plan.pdf",
    token: "tok",
  };
  assert(assertDirectUploadAuthorizationBinding(goodAuth, goodAuth.uploadId).ok, "binding accepts");
  assert(
    !assertDirectUploadAuthorizationBinding({ ...goodAuth, path: "other/path.pdf" }, goodAuth.uploadId)
      .ok,
    "binding rejects tampered path",
  );

  const oversizedMeta = assertReplyAttachmentDeclaredSize(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES + 1);
  assert(!oversizedMeta.ok && oversizedMeta.code === "size_rejected", "H4 declared size reject");

  const metaOk = validateInboxReplyAttachmentMeta({
    filename: "plan.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
  });
  assert(metaOk.ok === true, "meta pdf accepted");

  const pdf = validateInboxReplyAttachmentBytes({
    filename: "plan.pdf",
    contentType: "application/pdf",
    content: minimalPdf(),
  });
  assert(pdf.ok === true, "pdf accepted");
  assert(
    validateInboxReplyAttachmentBytes({
      filename: "a.png",
      contentType: "image/png",
      content: minimalPng(),
    }).ok === true,
    "png accepted",
  );
  assert(
    validateInboxReplyAttachmentBytes({
      filename: "a.jpg",
      contentType: "image/jpeg",
      content: minimalJpeg(),
    }).ok === true,
    "jpg accepted",
  );
  assert(
    validateInboxReplyAttachmentBytes({
      filename: "brief.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: minimalOoxml("docx", true),
    }).ok === true,
    "docx accepted",
  );
  assert(isValidOoxmlStructure(minimalOoxml("docx"), "docx"), "docx ooxml helper");
  assert(countZipLocalHeaders(minimalOoxml("docx")) >= 1, "local header counted");
  assert(
    !validateInboxReplyAttachmentBytes({
      filename: "x.exe",
      contentType: "application/octet-stream",
      content: minimalPdf(),
    }).ok,
    "exe blocked",
  );
  assert(
    looksLikeActiveReplyAttachmentContent(Buffer.from("%PDF-1.4\n<html><script>x</script>")),
    "html polyglot still blocked",
  );

  const sqlTests = read("scripts/ci/inbox-sql/reply-attachment-tests.mjs");
  assert(sqlTests.includes("reject refuses staging"), "H1 SQL reject staging test");
  assert(sqlTests.includes("foreign upload UUID"), "M2 foreign lock test");
  assert(sqlTests.includes("tampered lease path"), "lease path tamper test");
  assert(sqlTests.includes("storage_path format binds"), "path binding format test");
  assert(sqlTests.includes("dual-session concurrent finalize"), "H1 dual-session test");

  // --- Phase 4c composer helpers ---
  assert(
    resolveInboxReplyAttachmentContentType("plan.docx", "") ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "empty browser MIME resolves from extension",
  );
  assert(
    resolveInboxReplyAttachmentContentType("x.exe", "application/octet-stream") === null,
    "blocked extension stays null",
  );
  assert(
    validateComposerAttachmentSelection({
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      existingCount: 5,
      existingTotalBytes: 0,
    }).ok === false,
    "count quota enforced client-side",
  );
  assert(
    validateComposerAttachmentSelection({
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 4 * 1024 * 1024,
      existingCount: 2,
      existingTotalBytes: 9 * 1024 * 1024,
    }).ok === false,
    "total byte quota enforced client-side",
  );
  assert(
    validateComposerAttachmentSelection({
      filename: "ok.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      existingCount: 0,
      existingTotalBytes: 0,
    }).ok === true,
    "valid selection accepted",
  );
  assert(
    composerAttachmentsBlockSend([]).blocked === false,
    "empty list does not block text send",
  );
  assert(
    composerAttachmentsBlockSend([
      {
        localId: "1",
        parentMessageId: "p",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "uploading",
        uploadId: null,
        error: null,
        errorCode: null,
      },
    ]).blocked === true,
    "pending upload blocks send",
  );
  assert(
    composerAttachmentsBlockSend([
      {
        localId: "1",
        parentMessageId: "p",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "failed",
        uploadId: null,
        error: "x",
        errorCode: "storage_network_error",
      },
    ]).blocked === true,
    "failed upload blocks send",
  );
  assert(
    composerAttachmentsBlockSend([
      {
        localId: "1",
        parentMessageId: "p",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "staged",
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
        error: null,
        errorCode: null,
      },
    ]).blocked === true,
    "staged attachments block send while SMTP gate closed",
  );
  assert(
    composerAttachmentsBlockSend([
      {
        localId: "1",
        parentMessageId: "p",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "staged",
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
        error: null,
        errorCode: null,
      },
    ]).reason?.includes("nicht freigeschaltet") === true,
    "gate message clarifies send unavailable",
  );

  const lifecycle = read("src/lib/inbox/reply-attachment-lifecycle.ts");
  assert(lifecycle.includes("ignore_ui_only"), "stale finalize ignore helper");
  assert(lifecycle.includes("abandon_if_still_uploading"), "abandon unfinished helper");

  return "ok";
}
