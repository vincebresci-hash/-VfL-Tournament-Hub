/**
 * Phase 4c executable lifecycle / helper tests (node:test via tsx).
 * No browser, no Supabase, no SMTP.
 *
 * Run: npx tsx --test src/lib/inbox/reply-attachment-phase4c-tests.ts
 *
 * Covers pure decision logic the React panel must obey.
 * Full DOM/browser E2E remains a documented gap.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composerAttachmentStepIndex,
  composerAttachmentsBlockSend,
  countActiveComposerAttachments,
  formatComposerAttachmentValidationErrors,
  resolveInboxReplyAttachmentContentType,
  sumComposerAttachmentBytes,
  validateComposerAttachmentSelection,
} from "@/lib/inbox/reply-attachment-composer";
import {
  countsTowardClientQuota,
  decideListStagingParentAccess,
  decideRemoveAfterAbandon,
  decideRemoveAfterStagingRemove,
  decideStaleFinalizeOutcome,
  decideUnmountAutoCleanup,
  isPreservedServerUploadStatus,
  isUnfinishedServerUploadStatus,
} from "@/lib/inbox/reply-attachment-lifecycle";

describe("H1 lifecycle: never auto-delete staged/bound", () => {
  it("unmount skips staged uploads", () => {
    const decision = decideUnmountAutoCleanup({
      uiStatus: "staged",
      uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
    });
    assert.equal(decision.action, "skip");
  });

  it("unmount abandons only unfinished ui statuses with uploadId", () => {
    for (const uiStatus of [
      "queued",
      "authorizing",
      "uploading",
      "finalizing",
      "failed",
    ] as const) {
      const decision = decideUnmountAutoCleanup({
        uiStatus,
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
      });
      assert.equal(decision.action, "abandon_if_still_uploading", uiStatus);
    }
  });

  it("unmount skips rows without uploadId", () => {
    assert.equal(
      decideUnmountAutoCleanup({ uiStatus: "uploading", uploadId: null }).action,
      "skip",
    );
  });

  it("stale successful finalize is UI-ignore only", () => {
    assert.equal(
      decideStaleFinalizeOutcome({ finalizeOk: true }).action,
      "ignore_ui_only",
    );
    assert.equal(
      decideStaleFinalizeOutcome({
        finalizeOk: false,
        serverStatusAfter: "staging",
      }).action,
      "ignore_ui_only",
    );
  });

  it("stale failed finalize may abandon if still uploading", () => {
    assert.equal(
      decideStaleFinalizeOutcome({
        finalizeOk: false,
        serverStatusAfter: "uploading",
      }).action,
      "abandon_if_still_uploading",
    );
  });

  it("server status helpers", () => {
    assert.equal(isUnfinishedServerUploadStatus("uploading"), true);
    assert.equal(isUnfinishedServerUploadStatus("staging"), false);
    assert.equal(isPreservedServerUploadStatus("staging"), true);
    assert.equal(isPreservedServerUploadStatus("bound"), true);
    assert.equal(isPreservedServerUploadStatus("uploading"), false);
  });
});

describe("M1 step progress (not byte percent)", () => {
  it("exposes Schritt labels without claiming byte completion", () => {
    const uploading = composerAttachmentStepIndex("uploading");
    assert.equal(uploading.step, 2);
    assert.equal(uploading.totalSteps, 4);
    assert.match(uploading.label, /Hochladen/);
    const staged = composerAttachmentStepIndex("staged");
    assert.equal(staged.step, 4);
  });
});

describe("M4 quota retains unresolved failed uploadIds", () => {
  it("failed without uploadId does not count", () => {
    assert.equal(countsTowardClientQuota({ status: "failed", uploadId: null }), false);
  });

  it("failed with uploadId still counts", () => {
    assert.equal(
      countsTowardClientQuota({
        status: "failed",
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
      }),
      true,
    );
  });

  it("cleanupPending failed counts", () => {
    assert.equal(
      countsTowardClientQuota({
        status: "failed",
        uploadId: null,
        cleanupPending: true,
      }),
      true,
    );
  });

  it("count/sum helpers honor cleanupPending", () => {
    const items = [
      {
        status: "failed" as const,
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
        sizeBytes: 1000,
        cleanupPending: false,
      },
      {
        status: "staged" as const,
        uploadId: "550e8400-e29b-41d4-a716-4466554400ab",
        sizeBytes: 2000,
      },
    ];
    assert.equal(countActiveComposerAttachments(items), 2);
    assert.equal(sumComposerAttachmentBytes(items), 3000);
  });
});

describe("send gate while allowAttachmentSend is false", () => {
  it("blocks staged attachments", () => {
    const gate = composerAttachmentsBlockSend([
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
    ]);
    assert.equal(gate.blocked, true);
    assert.match(gate.reason ?? "", /nicht freigeschaltet/);
  });

  it("allows empty list (text-only)", () => {
    assert.equal(composerAttachmentsBlockSend([]).blocked, false);
  });

  it("blocks pending uploads", () => {
    assert.equal(
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
      ]).blocked,
      true,
    );
  });
});

describe("validation and multi-error formatting", () => {
  it("resolves empty MIME from extension", () => {
    assert.equal(
      resolveInboxReplyAttachmentContentType("x.docx", ""),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("rejects over count", () => {
    const result = validateComposerAttachmentSelection({
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      existingCount: 5,
      existingTotalBytes: 0,
    });
    assert.equal(result.ok, false);
  });

  it("formats multiple validation errors", () => {
    const text = formatComposerAttachmentValidationErrors([
      { filename: "a.exe", error: "Dateityp ist nicht erlaubt" },
      { filename: "b.bin", error: "Dateityp ist nicht erlaubt" },
    ]);
    assert.match(text ?? "", /a\.exe/);
    assert.match(text ?? "", /b\.bin/);
  });
});

describe("simulated message-switch after successful finalize", () => {
  it("stale pipeline must not request delete after finalizeOk", () => {
    const decision = decideStaleFinalizeOutcome({ finalizeOk: true });
    assert.equal(decision.action, "ignore_ui_only");
    const unmount = decideUnmountAutoCleanup({
      uiStatus: "staged",
      uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
    });
    assert.equal(unmount.action, "skip");
  });

  it("remove-during-finalize: staging preserved if finalize won", () => {
    assert.equal(isPreservedServerUploadStatus("staging"), true);
    assert.equal(
      decideStaleFinalizeOutcome({
        finalizeOk: false,
        serverStatusAfter: "staging",
      }).action,
      "ignore_ui_only",
    );
  });

  it("cancel with staged attachments does not auto-cleanup", () => {
    // M3/H1: confirm may close UI, but unmount decision for staged is skip.
    assert.equal(
      decideUnmountAutoCleanup({
        uiStatus: "staged",
        uploadId: "550e8400-e29b-41d4-a716-4466554400aa",
      }).action,
      "skip",
    );
  });
});

describe("M1 listStaging parent/mailbox visibility (negative)", () => {
  it("rejects unauthenticated", () => {
    assert.deepEqual(
      decideListStagingParentAccess({
        authenticated: false,
        parentMessageId: "550e8400-e29b-41d4-a716-4466554400aa",
        parentVisible: true,
      }),
      { ok: false, errorCode: "unauthorized" },
    );
  });

  it("rejects inaccessible parent/mailbox", () => {
    assert.deepEqual(
      decideListStagingParentAccess({
        authenticated: true,
        parentMessageId: "550e8400-e29b-41d4-a716-4466554400aa",
        parentVisible: false,
      }),
      { ok: false, errorCode: "parent_not_found" },
    );
  });

  it("rejects invalid parent id", () => {
    assert.deepEqual(
      decideListStagingParentAccess({
        authenticated: true,
        parentMessageId: "not-a-uuid",
        parentVisible: true,
      }),
      { ok: false, errorCode: "invalid_input" },
    );
  });

  it("allows visible parent for authenticated actor", () => {
    assert.deepEqual(
      decideListStagingParentAccess({
        authenticated: true,
        parentMessageId: "550e8400-e29b-41d4-a716-4466554400aa",
        parentVisible: true,
      }),
      { ok: true },
    );
  });
});

describe("M2 remove during finalize race", () => {
  it("abandoned uploading drops from UI", () => {
    assert.equal(
      decideRemoveAfterAbandon({
        abandonOk: true,
        abandoned: true,
        errorCode: null,
      }).action,
      "drop_from_ui",
    );
  });

  it("not_unfinished continues explicit staging remove (never silent hide)", () => {
    assert.equal(
      decideRemoveAfterAbandon({
        abandonOk: true,
        abandoned: false,
        errorCode: "not_unfinished",
      }).action,
      "continue_explicit_staging_remove",
    );
  });

  it("failed staging remove reconciles as staged", () => {
    const decision = decideRemoveAfterStagingRemove({
      removeOk: false,
      errorCode: "remove_failed",
    });
    assert.equal(decision.action, "reconcile_as_staged");
  });

  it("successful staging remove drops", () => {
    assert.equal(
      decideRemoveAfterStagingRemove({ removeOk: true }).action,
      "drop_from_ui",
    );
  });

  it("abandon failure keeps with error (no silent hide)", () => {
    const decision = decideRemoveAfterAbandon({
      abandonOk: false,
      abandoned: false,
      errorCode: "cleanup_failed",
    });
    assert.equal(decision.action, "keep_with_error");
  });
});
