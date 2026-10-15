import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CLAIM_INBOX_REPLY_SQL_ERROR_CODES,
  executeInboxReplySend,
  mapClaimErrorCode,
  parseClaimInboxReplyRow,
  redactInboxSmtpAuditText,
  resolveMailboxMessageIdDomainUpdate,
  type InboxReplyClaimRow,
  type InboxReplyOperationalAlert,
  type InboxReplySendDeps,
  type InboxReplySmtpConfig,
  type InboxReplySmtpSendResult,
  type SendInboxReplyInput,
} from "@/lib/inbox/reply-send";
import { ROLE_PERMISSIONS, resolvePermissionAccess } from "@/lib/rbac/permissions";
import type { AuthSession } from "@/types/auth";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const SMTP_CONFIG: InboxReplySmtpConfig = {
  host: "smtp.ionos.de",
  port: 465,
  secure: true,
  requireTls: false,
  user: "turnier@vfl-kirchheim.de",
  password: "secret-password-value",
  fromAddress: "turnier@vfl-kirchheim.de",
  fromName: "VfL Kirchheim",
  messageIdDomain: "vfl-kirchheim.de",
};

const PARENT = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  mailboxId: "550e8400-e29b-41d4-a716-446655440001",
  fromAddress: "sender@example.com",
  subject: "Anfrage",
};

const BASE_INPUT: SendInboxReplyInput = {
  parentMessageId: PARENT.id,
  toAddress: "sender@example.com",
  subject: "Anfrage",
  bodyText: "Danke für Ihre Nachricht.",
  idempotencyKey: "550e8400-e29b-41d4-a716-4466554400aa",
};

function fakeSession(): AuthSession {
  return {
    user: {
      id: "user-1",
      email: "admin@example.com",
      role: "admin",
      isActive: true,
      clubId: null,
    },
  } as AuthSession;
}

type Harness = {
  smtpCalls: number;
  lastSmtpMail: Parameters<InboxReplySendDeps["sendSmtp"]>[1] | null;
  finalizeCalls: Array<{ status: string; error: string | null; smtpResponse: string | null }>;
  alerts: InboxReplyOperationalAlert[];
  claimImpl: InboxReplySendDeps["claimReply"];
  sendImpl: InboxReplySendDeps["sendSmtp"];
  finalizeImpl?: InboxReplySendDeps["finalizeReply"];
  listBoundUploads?: InboxReplySendDeps["listBoundUploads"];
  downloadBoundUpload?: InboxReplySendDeps["downloadBoundUpload"];
  allowAttachmentSend: boolean;
  canReply: boolean;
  smtpConfig: InboxReplySmtpConfig | null;
  parent: typeof PARENT | null;
  domainResult: Awaited<ReturnType<InboxReplySendDeps["ensureMessageIdDomain"]>>;
  finalizeOk: boolean;
  /** If set, first N finalize calls fail, then succeed. */
  finalizeFailCount: number;
  sessionError: string | null;
  nowMs?: () => number;
  deploymentMaxDurationSeconds?: number;
};

function createHarness(overrides?: Partial<Harness>): {
  deps: InboxReplySendDeps;
  state: Harness;
} {
  const state: Harness = {
    smtpCalls: 0,
    lastSmtpMail: null,
    finalizeCalls: [],
    alerts: [],
    canReply: true,
    smtpConfig: SMTP_CONFIG,
    parent: PARENT,
    domainResult: { ok: true },
    finalizeOk: true,
    finalizeFailCount: 0,
    sessionError: null,
    allowAttachmentSend: false,
    claimImpl: async () => ({
      row: {
        replyId: "550e8400-e29b-41d4-a716-4466554400bb",
        status: "sending",
        sendAllowed: true,
        alreadyExisted: false,
        errorCode: null,
        messageIdHeader: "abc@vfl-kirchheim.de",
        inReplyToHeader: "<parent@example.com>",
        referencesHeader: "<root@example.com> <parent@example.com>",
      },
      error: null,
    }),
    sendImpl: async () => ({ outcome: "sent", response: "250 OK" }),
    ...overrides,
  };

  const deps: InboxReplySendDeps = {
    requireSession: async () => {
      if (state.sessionError) {
        return { error: state.sessionError, session: null, authorization: null };
      }
      return {
        error: null,
        session: fakeSession(),
        authorization: {
          roleKeys: ["ADMIN"],
          overrides: [],
        } as never,
      };
    },
    canReply: () => state.canReply,
    readSmtpConfig: () => state.smtpConfig,
    loadParentMessage: async () => state.parent,
    ensureMessageIdDomain: async () => state.domainResult,
    claimReply: async (input) => state.claimImpl(input),
    listBoundUploads: state.listBoundUploads,
    downloadBoundUpload: state.downloadBoundUpload,
    allowAttachmentSend: state.allowAttachmentSend,
    nowMs: state.nowMs,
    deploymentMaxDurationSeconds: state.deploymentMaxDurationSeconds,
    sendSmtp: async (config, mail) => {
      state.smtpCalls += 1;
      state.lastSmtpMail = mail;
      assert(!JSON.stringify(mail).includes(config.password), "password leaked into mail");
      return state.sendImpl(config, mail);
    },
    finalizeReply: async (input) => {
      if (state.finalizeImpl) {
        const result = await state.finalizeImpl(input);
        state.finalizeCalls.push({
          status: input.status,
          error: input.error,
          smtpResponse: input.smtpResponse,
        });
        return result;
      }
      state.finalizeCalls.push({
        status: input.status,
        error: input.error,
        smtpResponse: input.smtpResponse,
      });
      if (state.finalizeFailCount > 0) {
        state.finalizeFailCount -= 1;
        return { ok: false, error: "finalize failed" };
      }
      if (!state.finalizeOk) {
        return { ok: false, error: "finalize failed" };
      }
      return { ok: true, error: null };
    },
    emitOperationalAlert: (alert) => {
      state.alerts.push(alert);
    },
  };

  return { deps, state };
}

function runStaticReplySendChecks() {
  const actions = read("src/lib/inbox/actions.ts");
  const sendAction = read("src/lib/inbox/reply-send-action.ts");
  const sendCore = read("src/lib/inbox/reply-send.ts");
  const smtpClient = read("src/lib/inbox/smtp-client.ts");
  const migration = read("supabase/migrations/20261013120000_inbox_replies_smtp.sql");
  const detailUi = read("src/components/admin/InboxMessageDetail.tsx");
  const sync = read("src/lib/inbox/sync.ts");

  assert(existsSync(join(process.cwd(), "src/lib/inbox/reply-send.ts")), "reply-send module");
  assert(
    existsSync(join(process.cwd(), "src/lib/inbox/reply-send-action.ts")),
    "reply-send-action module",
  );
  assert(actions.includes("sendInboxReplyAction"), "actions exports sendInboxReplyAction");

  // M2: real wiring — claim uses user client; finalize/domain/downloads use service_role.
  const claimFnStart = sendAction.indexOf("async function claimReplySend");
  const listBoundStart = sendAction.indexOf("async function listBoundUploadsForReply");
  const finalizeFnStart = sendAction.indexOf("async function finalizeReplySend");
  const domainFnStart = sendAction.indexOf("async function ensureMailboxMessageIdDomain");
  assert(claimFnStart >= 0 && finalizeFnStart >= 0 && domainFnStart >= 0, "wiring helpers present");
  assert(listBoundStart > claimFnStart, "listBound follows claim helper");
  const claimSlice = sendAction.slice(claimFnStart, listBoundStart);
  const finalizeSlice = sendAction.slice(finalizeFnStart);
  const domainSlice = sendAction.slice(domainFnStart, claimFnStart);
  assert(claimSlice.includes("createClient()"), "claim uses authenticated createClient");
  assert(!claimSlice.includes("createServiceRoleClient"), "claim must not use service_role");
  assert(claimSlice.includes("claim_inbox_reply_send"), "claim RPC wired");
  assert(claimSlice.includes("p_upload_ids"), "claim passes upload ids");
  assert(finalizeSlice.includes("createServiceRoleClient"), "finalize uses service_role");
  assert(finalizeSlice.includes("finalize_inbox_reply_send"), "finalize RPC wired");
  assert(
    finalizeSlice.includes("redactInboxSmtpAuditText"),
    "finalize redacts audit fields before RPC",
  );
  assert(domainSlice.includes("createServiceRoleClient"), "domain ensure uses service_role");
  assert(sendAction.includes("sendInboxSmtpMail"), "IONOS SMTP client wired");
  assert(sendAction.includes("readInboxSmtpConfig"), "SMTP config wired");
  assert(sendAction.includes("emitInboxReplyOperationalAlert"), "ops alert wired");
  assert(sendAction.includes('import "server-only"'), "send action server-only");
  assert(!sendAction.includes("@/lib/email"), "no Resend/email provider in send action");
  assert(!actions.includes("@/lib/email"), "actions still isolated from Resend");
  assert(!sync.includes("sendInboxSmtpMail"), "IMAP sync does not send SMTP replies");
  // Phase 3: composer owns the client call; detail must not invoke the action directly.
  assert(!detailUi.includes("sendInboxReplyAction"), "detail does not call send action directly");
  assert(detailUi.includes("InboxMessageReplySection"), "Phase 3: detail embeds reply section");
  const composerUi = read("src/components/admin/inbox/InboxReplyComposer.tsx");
  assert(composerUi.includes("sendInboxReplyAction"), "Phase 3: composer wires send action");
  assert(composerUi.includes("smtp_uncertain"), "Phase 3: handles uncertain without retry");
  assert(
    read("src/components/admin/inbox/InboxMessageReplySection.tsx").includes("key={message.id}") ||
      detailUi.includes("key={message.id}"),
    "Phase 3: keyed remount for draft isolation",
  );
  assert(smtpClient.includes("rejectUnauthorized: true"), "TLS fail-closed preserved");
  assert(smtpClient.includes("attachments"), "Phase 4b SMTP attachments supported");
  assert(sendCore.includes("shouldAutoRetrySmtp"), "auto-retry policy consulted");
  assert(sendCore.includes("normalizeInboxReplyAttachmentRefs"), "Phase 4b upload id normalize");
  assert(sendCore.includes("evaluateInboxReplyAttachmentRuntimeBudget"), "Hobby budget gate");
  assert(sendAction.includes("allowAttachmentSend: false"), "production fail-closed for attachments");
  assert(sendAction.includes("list_inbox_reply_bound_uploads"), "bound upload list wired");
  assert(sendAction.includes("downloadBoundUploadBytes"), "checksum download wired");
  assert(
    existsSync(join(process.cwd(), "supabase/migrations/20261014210000_inbox_reply_attachment_send.sql")),
    "Phase 4b migration exists",
  );
  const phase4bMigration = read("supabase/migrations/20261014210000_inbox_reply_attachment_send.sql");
  assert(phase4bMigration.includes("p_upload_ids uuid[]"), "claim accepts upload ids");
  assert(phase4bMigration.includes("idempotency_attachment_conflict"), "idempotency conflict code");
  assert(phase4bMigration.includes("retain_until = now() + interval '30 days'"), "retention on finalize");
  const composerUiPhase4 = read("src/components/admin/inbox/InboxReplyComposer.tsx");
  const attachmentPanel = read("src/components/admin/inbox/InboxReplyAttachmentPanel.tsx");
  assert(composerUiPhase4.includes("InboxReplyAttachmentPanel"), "Phase 4c panel mounted");
  assert(composerUiPhase4.includes("composerAttachmentsBlockSend"), "Phase 4c client send gate");
  assert(composerUiPhase4.includes("allowAttachmentSend: false"), "Phase 4c UI keeps SMTP gate closed");
  assert(!composerUiPhase4.includes("attachments:"), "composer does not forward attachment refs while gated");
  assert(attachmentPanel.includes("beginInboxReplyAttachmentUploadAction"), "panel begin-wired");
  assert(attachmentPanel.includes("finalizeInboxReplyAttachmentUploadAction"), "panel finalize-wired");
  assert(attachmentPanel.includes("uploadInboxReplyAttachmentToSignedUrl"), "panel direct-upload-wired");
  assert(attachmentPanel.includes("removeInboxReplyAttachmentAction"), "panel remove-wired");
  assert(attachmentPanel.includes("abandonUnfinishedInboxReplyAttachmentAction"), "panel H1 abandon-wired");
  assert(attachmentPanel.includes("listInboxReplyStagingAttachmentsAction"), "panel restore-wired");
  assert(attachmentPanel.includes("local scope only"), "signed authorization not stored in React state");
  assert(!attachmentPanel.includes("console.log"), "panel never logs upload details");
  assert(!attachmentPanel.includes("console.info"), "panel never info-logs upload details");
  assert(!attachmentPanel.includes("console.debug"), "panel never debug-logs upload details");
  assert(
    sendCore.includes("finalize_primary_failed") || sendCore.includes("compensation"),
    "H2 compensation path present",
  );
  assert(
    migration.includes("v_smtp := regexp_replace(v_smtp"),
    "M1 SQL redacts smtp_response",
  );
  assert(
    !ROLE_PERMISSIONS.COMMUNICATION_MANAGER.includes("inbox.reply"),
    "CM still lacks inbox.reply",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["ADMIN"],
      overrides: [],
      permission: "inbox.reply",
    }),
    "ADMIN inbox.reply still granted",
  );

  // H1: every SQL claim error_code is mapped (not collapsed to claim_failed incorrectly).
  for (const code of CLAIM_INBOX_REPLY_SQL_ERROR_CODES) {
    const mapped = mapClaimErrorCode(code);
    assert(Boolean(mapped.message), `mapping message for ${code}`);
    if (code === "not_authenticated") {
      assert(mapped.errorCode === "unauthorized", "not_authenticated → unauthorized");
    } else if (code === "not_authorized" || code === "not_authorized_view") {
      assert(mapped.errorCode === "forbidden", `${code} → forbidden`);
    } else if (code === "recipient_locked") {
      assert(mapped.errorCode === "validation", "recipient_locked → validation");
    } else if (code === "parent_not_found") {
      assert(mapped.errorCode === "parent_not_found", "parent_not_found preserved");
    } else if (code === "header_injection" || code === "invalid_input") {
      assert(mapped.errorCode === "validation", `${code} → validation`);
    } else if (code === "rate_limited") {
      assert(mapped.errorCode === "rate_limited", "rate_limited preserved");
    } else if (code === "unresolved_reply_exists") {
      assert(mapped.errorCode === "unresolved_reply_exists", "unresolved preserved");
    } else if (code === "domain_not_configured") {
      assert(mapped.errorCode === "domain_not_configured", "domain preserved");
    }
  }
  assert(
    mapClaimErrorCode("recipient_mismatch").errorCode === "claim_failed",
    "legacy wrong code must not silently map as recipient",
  );

  assert(
    Boolean(redactInboxSmtpAuditText("550 fail password=supersecret")?.includes("[redacted]")),
    "redact password",
  );
  assert(
    Boolean(redactInboxSmtpAuditText("AUTH PLAIN dXNlcjpwYXNz")?.includes("[redacted]")),
    "redact AUTH PLAIN",
  );
  assert(
    !`${redactInboxSmtpAuditText("password=supersecret")}`.includes("supersecret"),
    "secret removed",
  );

  assert(
    resolveMailboxMessageIdDomainUpdate({
      currentDomain: null,
      configuredDomain: "vfl-kirchheim.de",
    }).action === "set",
    "unset domain → set",
  );
  assert(
    resolveMailboxMessageIdDomainUpdate({
      currentDomain: "other.example",
      configuredDomain: "vfl-kirchheim.de",
    }).action === "mismatch",
    "mismatched domain refused",
  );

  const parsed = parseClaimInboxReplyRow([
    {
      reply_id: "550e8400-e29b-41d4-a716-4466554400bb",
      reply_status: "sending",
      send_allowed: true,
      already_existed: false,
      error_code: null,
      message_id_header: "x@vfl-kirchheim.de",
      in_reply_to_header: "<a@b.c>",
      references_header: "<a@b.c>",
    },
  ]);
  assert(parsed?.sendAllowed === true && parsed.status === "sending", "parse claim row");
}

async function runMockedSmtpReplySendChecks() {
  {
    const { deps } = createHarness({ sessionError: "Bitte zuerst anmelden." });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "unauthorized", "unauthorized code");
    assert(result.sendAttempted === false, "no send when unauthorized");
  }

  {
    const { deps, state } = createHarness({ canReply: false });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "forbidden", "forbidden code");
    assert(state.smtpCalls === 0, "no SMTP without reply permission");
  }

  // H1: SQL authorization / recipient / injection codes mapped + no SMTP.
  for (const [sqlCode, expected] of [
    ["not_authorized", "forbidden"],
    ["not_authorized_view", "forbidden"],
    ["recipient_locked", "validation"],
    ["header_injection", "validation"],
    ["invalid_input", "validation"],
    ["parent_not_found", "parent_not_found"],
    ["invalid_idempotency_key", "validation"],
  ] as const) {
    const { deps, state } = createHarness({
      claimImpl: async () => ({
        row: {
          replyId: null,
          status: null,
          sendAllowed: false,
          alreadyExisted: false,
          errorCode: sqlCode,
          messageIdHeader: null,
          inReplyToHeader: null,
          referencesHeader: null,
        } satisfies InboxReplyClaimRow,
        error: null,
      }),
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === expected, `${sqlCode} → ${expected}, got ${result.errorCode}`);
    assert(state.smtpCalls === 0, `no SMTP for ${sqlCode}`);
  }

  {
    const { deps, state } = createHarness();
    const result = await executeInboxReplySend(
      { ...BASE_INPUT, attachments: { name: "x.pdf" } as unknown as [] },
      deps,
    );
    assert(result.errorCode === "attachments_invalid", "object attachments blocked");
    assert(state.smtpCalls === 0, "no SMTP with object attachments");
  }

  {
    // Hobby fail-closed: attachments refused before claim/SMTP.
    const { deps, state } = createHarness({
      allowAttachmentSend: false,
      claimImpl: async () => {
        throw new Error("claim must not run when budget blocks attachments");
      },
    });
    const result = await executeInboxReplySend(
      {
        ...BASE_INPUT,
        attachments: [{ uploadId: "550e8400-e29b-41d4-a716-4466554400f1" }],
      },
      deps,
    );
    assert(result.errorCode === "attachments_runtime_budget", "Hobby budget blocks attachments");
    assert(state.smtpCalls === 0, "no SMTP when budget blocks");
  }

  {
    const pdfBytes = Buffer.from("%PDF-1.4\n%%EOF\n");
    const uploadId = "550e8400-e29b-41d4-a716-4466554400f1";
    let claimedUploadIds: string[] | null = null;
    const { deps, state } = createHarness({
      allowAttachmentSend: true,
      claimImpl: async (input) => {
        claimedUploadIds = input.uploadIds;
        return {
          row: {
            replyId: "550e8400-e29b-41d4-a716-4466554400bb",
            status: "sending",
            sendAllowed: true,
            alreadyExisted: false,
            errorCode: null,
            messageIdHeader: "abc@vfl-kirchheim.de",
            inReplyToHeader: "<parent@example.com>",
            referencesHeader: "<root@example.com> <parent@example.com>",
          },
          error: null,
        };
      },
      listBoundUploads: async () => ({
        rows: [
          {
            uploadId,
            filename: "plan.pdf",
            contentType: "application/pdf",
            sizeBytes: pdfBytes.length,
            checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            storagePath: "mb/msg/user/upload/plan.pdf",
            bindOrdinal: 1,
          },
        ],
        error: null,
      }),
      downloadBoundUpload: async () => ({
        // Force checksum path: return bytes; harness download ignores expected hash here —
        // production action verifies. For this unit test we stub verified bytes.
        content: pdfBytes,
        error: null,
      }),
    });
    // Override list checksum to match stub download (downloadBoundUpload ignores verify in harness).
    const result = await executeInboxReplySend(
      { ...BASE_INPUT, attachments: [{ uploadId }] },
      deps,
    );
    assert(result.ok === true, "attachment send ok with allowAttachmentSend");
    assert(state.smtpCalls === 1, "SMTP invoked once with attachments");
    assert(JSON.stringify(claimedUploadIds) === JSON.stringify([uploadId]), "claim got upload ids");
    assert(state.lastSmtpMail?.attachments?.length === 1, "MIME attachment present");
    assert(state.lastSmtpMail?.attachments?.[0]?.filename === "plan.pdf", "safe filename");
    assert(state.lastSmtpMail?.attachments?.[0]?.contentType === "application/pdf", "content type");
    assert(
      state.lastSmtpMail?.attachments?.[0]?.content.length === pdfBytes.length,
      "byte length preserved",
    );
  }

  {
    const uploadId = "550e8400-e29b-41d4-a716-4466554400f2";
    const { deps, state } = createHarness({
      allowAttachmentSend: true,
      listBoundUploads: async () => ({
        rows: [
          {
            uploadId,
            filename: "plan.pdf",
            contentType: "application/pdf",
            sizeBytes: 10,
            checksumSha256: "a".repeat(64),
            storagePath: "path/plan.pdf",
            bindOrdinal: 1,
          },
        ],
        error: null,
      }),
      downloadBoundUpload: async () => ({ content: null, error: "checksum_mismatch" }),
    });
    const result = await executeInboxReplySend(
      { ...BASE_INPUT, attachments: [{ uploadId }] },
      deps,
    );
    assert(result.errorCode === "attachment_load_failed", "checksum/download failure");
    assert(state.smtpCalls === 0, "no SMTP after download failure");
    assert(state.finalizeCalls.some((c) => c.status === "failed"), "finalize failed after load error");
  }

  {
    // H2: slow storage exhausts pre-SMTP budget → no SMTP, finalize failed (never uncertain auto-resend).
    const pdfBytes = Buffer.from("%PDF-1.4\n%%EOF\n");
    const uploadId = "550e8400-e29b-41d4-a716-4466554400f4";
    let clock = 1_000_000;
    const { deps, state } = createHarness({
      allowAttachmentSend: true,
      deploymentMaxDurationSeconds: 180,
      nowMs: () => clock,
      listBoundUploads: async () => ({
        rows: [
          {
            uploadId,
            filename: "slow.pdf",
            contentType: "application/pdf",
            sizeBytes: pdfBytes.length,
            checksumSha256: "b".repeat(64),
            storagePath: "mb/msg/user/upload/slow.pdf",
            bindOrdinal: 1,
          },
        ],
        error: null,
      }),
      downloadBoundUpload: async () => {
        clock += 120_000; // slow download burns wall clock
        return { content: pdfBytes, error: null };
      },
    });
    const result = await executeInboxReplySend(
      { ...BASE_INPUT, attachments: [{ uploadId }] },
      deps,
    );
    assert(result.errorCode === "attachments_runtime_budget", "budget blocks SMTP after slow download");
    assert(state.smtpCalls === 0, "SMTP must not start without remaining budget");
    assert(
      state.finalizeCalls.some((c) => c.status === "failed" && c.error === "smtp_budget_exhausted_pre_send"),
      "failed finalize without SMTP attempt",
    );
  }

  {
    // H2: slow SMTP still invokes once; uncertain path never auto-retries (sendImpl returns uncertain).
    const pdfBytes = Buffer.from("%PDF-1.4\n%%EOF\n");
    const uploadId = "550e8400-e29b-41d4-a716-4466554400f5";
    const { deps, state } = createHarness({
      allowAttachmentSend: true,
      deploymentMaxDurationSeconds: 180,
      listBoundUploads: async () => ({
        rows: [
          {
            uploadId,
            filename: "ok.pdf",
            contentType: "application/pdf",
            sizeBytes: pdfBytes.length,
            checksumSha256: "c".repeat(64),
            storagePath: "mb/msg/user/upload/ok.pdf",
            bindOrdinal: 1,
          },
        ],
        error: null,
      }),
      downloadBoundUpload: async () => ({ content: pdfBytes, error: null }),
      sendImpl: async () => ({
        outcome: "uncertain",
        error: "SMTP send timed out",
        response: null,
      }),
    });
    const result = await executeInboxReplySend(
      { ...BASE_INPUT, attachments: [{ uploadId }] },
      deps,
    );
    assert(result.errorCode === "smtp_uncertain", "slow/timeout SMTP → uncertain");
    assert(state.smtpCalls === 1, "SMTP exactly once");
    assert(state.finalizeCalls[0]?.status === "uncertain", "finalize uncertain");
  }

  {
    const { deps, state } = createHarness({
      allowAttachmentSend: true,
      claimImpl: async () => ({
        row: {
          replyId: null,
          status: null,
          sendAllowed: false,
          alreadyExisted: false,
          errorCode: "attachment_invalid",
          messageIdHeader: null,
          inReplyToHeader: null,
          referencesHeader: null,
        },
        error: null,
      }),
    });
    const result = await executeInboxReplySend(
      {
        ...BASE_INPUT,
        attachments: [{ uploadId: "550e8400-e29b-41d4-a716-4466554400f3" }],
      },
      deps,
    );
    assert(result.errorCode === "attachments_invalid", "invalid staging blocked");
    assert(state.smtpCalls === 0, "no SMTP when claim rejects attachments");
  }

  {
    const { deps, state } = createHarness({
      claimImpl: async () => ({
        row: {
          replyId: null,
          status: null,
          sendAllowed: false,
          alreadyExisted: false,
          errorCode: "rate_limited",
          messageIdHeader: null,
          inReplyToHeader: null,
          referencesHeader: null,
        },
        error: null,
      }),
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "rate_limited", "rate limited");
    assert(state.smtpCalls === 0, "no SMTP when rate limited");
  }

  {
    const { deps, state } = createHarness({
      claimImpl: async () => ({
        row: {
          replyId: "550e8400-e29b-41d4-a716-4466554400cc",
          status: "sent",
          sendAllowed: false,
          alreadyExisted: true,
          errorCode: null,
          messageIdHeader: "abc@vfl-kirchheim.de",
          inReplyToHeader: null,
          referencesHeader: null,
        },
        error: null,
      }),
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.ok === true && result.status === "sent", "idempotent sent ok");
    assert(state.smtpCalls === 0, "idempotent replay never SMTP");
  }

  {
    const { deps, state } = createHarness();
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.ok && result.status === "sent", "sent ok");
    assert(state.smtpCalls === 1, "exactly one SMTP call");
    assert(state.finalizeCalls[0]?.status === "sent", "finalize sent");
    assert(!JSON.stringify(result).includes("secret-password-value"), "no password in result");
  }

  {
    const { deps, state } = createHarness({
      sendImpl: async () =>
        ({
          outcome: "failed",
          error: "550 mailbox unavailable password=supersecret",
          response: "password=supersecret",
        }) satisfies InboxReplySmtpSendResult,
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "smtp_failed" && result.status === "failed", "failed path");
    assert(state.finalizeCalls[0]?.status === "failed", "finalize failed");
    assert(
      !`${state.finalizeCalls[0]?.error ?? ""}`.includes("supersecret"),
      "finalize error redacted",
    );
    assert(
      !`${state.finalizeCalls[0]?.smtpResponse ?? ""}`.includes("supersecret"),
      "finalize smtp_response redacted",
    );
    assert(!result.error?.includes("supersecret"), "credential-safe user error");
  }

  // H2: SMTP sent + primary finalize fail → one compensating uncertain finalize, no 2nd SMTP.
  {
    const { deps, state } = createHarness({ finalizeFailCount: 1 });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "finalize_failed", "finalize_failed code");
    assert(result.status === "uncertain", "client status uncertain");
    assert(state.smtpCalls === 1, "do not retry SMTP after finalize failure");
    assert(state.finalizeCalls.length === 2, "primary + compensating finalize");
    assert(state.finalizeCalls[0]?.status === "sent", "primary targeted sent");
    assert(state.finalizeCalls[1]?.status === "uncertain", "compensation uncertain");
    assert(state.alerts.length === 0, "no ops alert when compensation succeeds");
    assert(Boolean(result.error?.includes("nicht erneut senden")), "no-retry user copy");
  }

  // H2: compensation also fails → ops alert + uncertain warning; still no SMTP retry.
  {
    const { deps, state } = createHarness({ finalizeOk: false });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "finalize_failed", "finalize_failed when both fail");
    assert(result.status === "uncertain", "uncertain warning");
    assert(state.smtpCalls === 1, "still single SMTP");
    assert(state.finalizeCalls.length === 2, "attempted compensation");
    assert(state.alerts.length === 1, "ops alert emitted");
    assert(
      state.alerts[0]?.kind === "inbox_reply_finalize_compensation_failed",
      "alert kind",
    );
    assert(
      !JSON.stringify(state.alerts[0]).includes("secret-password-value"),
      "alert has no smtp password",
    );
  }

  // M4: SMTP failed + finalize failed → compensate uncertain; do not invite safe retry.
  {
    const { deps, state } = createHarness({
      finalizeFailCount: 1,
      sendImpl: async () =>
        ({
          outcome: "failed",
          error: "550 rejected",
          response: null,
        }) satisfies InboxReplySmtpSendResult,
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.status === "uncertain", "M4 unresolved → uncertain");
    assert(Boolean(result.error?.includes("nicht erneut senden")), "M4 no safe-retry copy");
    assert(state.smtpCalls === 1, "M4 no SMTP retry");
    assert(state.finalizeCalls[1]?.status === "uncertain", "M4 compensation uncertain");
  }

  {
    const { deps, state } = createHarness({
      sendImpl: async () =>
        ({
          outcome: "uncertain",
          error: "SMTP send timed out",
          response: null,
        }) satisfies InboxReplySmtpSendResult,
    });
    const result = await executeInboxReplySend(BASE_INPUT, deps);
    assert(result.errorCode === "smtp_uncertain", "uncertain code");
    assert(state.smtpCalls === 1, "single SMTP attempt");
    assert(state.finalizeCalls[0]?.status === "uncertain", "finalize uncertain");
  }

  {
    let seenInReplyTo: string | null | undefined;
    let seenReferences: string | null | undefined;
    let seenMessageId: string | undefined;
    const { deps } = createHarness({
      sendImpl: async (_config, mail) => {
        seenInReplyTo = mail.inReplyTo;
        seenReferences = mail.references;
        seenMessageId = mail.messageId;
        return { outcome: "sent", response: "250 OK" };
      },
    });
    await executeInboxReplySend(BASE_INPUT, deps);
    assert(seenMessageId === "abc@vfl-kirchheim.de", "message-id from claim");
    assert(seenInReplyTo === "<parent@example.com>", "In-Reply-To preserved");
    assert(
      typeof seenReferences === "string" && seenReferences.includes("<parent@example.com>"),
      "References preserved",
    );
  }
}

/** Static wiring + mocked SMTP orchestration checks for Phase 2 send action. */
export async function runInboxReplySendChecks(): Promise<"ok"> {
  runStaticReplySendChecks();
  await runMockedSmtpReplySendChecks();
  return "ok";
}
