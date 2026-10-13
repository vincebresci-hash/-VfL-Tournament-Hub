import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeMessageIdHeader } from "@/lib/inbox/identity";
import {
  applyReplyClaimTransition,
  applyReplyFinalizeTransition,
  applyReplyReconcileTransition,
  blocksAutoResend,
  finalizeStatusForSmtpResult,
  hasUnresolvedReplyBlocker,
  isStaleSending,
  mayInvokeSmtpAfterClaim,
  normalizeStatusForClaimGate,
  shouldAutoRetrySmtp,
  INBOX_REPLY_RECONCILE_PROCEDURE,
} from "@/lib/inbox/reply-lifecycle";
import {
  assertMessageIdDomain,
  buildInboxReplyThreadingHeaders,
  resolveMessageIdDomain,
} from "@/lib/inbox/reply-headers";
import {
  assertReplyRecipientLocked,
  containsHeaderInjection,
  isInboxReplyRateLimited,
  messageIdDomainFromEmail,
  normalizeReplySubject,
  validateInboxReplyDraft,
  validateIdempotencyKey,
  validateReplySubject,
} from "@/lib/inbox/reply-validation";
import { ROLE_PERMISSIONS, resolvePermissionAccess } from "@/lib/rbac/permissions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function runInboxReplyChecks() {
  const migration = read("supabase/migrations/20261013120000_inbox_replies_smtp.sql");
  const smtpConfig = read("src/lib/inbox/smtp-config.ts");
  const smtpClient = read("src/lib/inbox/smtp-client.ts");
  const access = read("src/lib/inbox/access.ts");
  const actions = read("src/lib/inbox/actions.ts");
  const sync = read("src/lib/inbox/sync.ts");
  const detailUi = read("src/components/admin/InboxMessageDetail.tsx");
  const sanitize = read("src/lib/inbox/sanitize-html.ts");
  const headers = read("src/lib/inbox/reply-headers.ts");
  const lifecycle = read("src/lib/inbox/reply-lifecycle.ts");

  // --- Migration contracts (H1–H6 + related) ---
  assert(migration.includes("BEGIN;") && migration.includes("COMMIT;"), "transactional migration");
  assert(migration.includes("inbox.reply"), "permission inbox.reply");
  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.inbox_replies"), "inbox_replies table");
  assert(
    migration.includes("UNIQUE (created_by, idempotency_key)"),
    "actor-scoped idempotency unique",
  );
  assert(!migration.includes("UNIQUE (idempotency_key)"), "no global idempotency unique");
  assert(migration.includes("idempotency_key uuid NOT NULL"), "UUID idempotency at DB");
  assert(migration.includes("pg_advisory_xact_lock"), "per-actor advisory lock");
  assert(migration.includes("rate_limited"), "rate limit error in claim");
  assert(migration.includes("interval '10 minutes'"), "rate limit window in claim");
  assert(migration.includes("unresolved_reply_exists"), "parent unresolved blocker");
  assert(migration.includes("send_abandoned_timeout"), "stale sending → uncertain");
  assert(migration.includes("expire_stale_inbox_reply_sends"), "expire helper");
  assert(migration.includes("reconcile_inbox_reply_status"), "manual reconcile RPC");
  assert(migration.includes("has_rbac_permission('inbox.view')"), "claim requires inbox.view");
  assert(migration.includes("has_rbac_permission('inbox.reply')"), "claim requires inbox.reply");
  assert(migration.includes("reply_message_id_domain"), "mailbox Message-ID domain");
  assert(migration.includes("domain_not_configured"), "domain gate");
  assert(migration.includes("inbox.local"), "explicit reject of inbox.local in SQL");
  assert(migration.includes("gen_random_uuid()::text || '@'"), "server-side Message-ID");
  assert(
    !migration.includes("p_message_id_header"),
    "Message-ID not accepted from client params",
  );
  assert(migration.includes("length(subject) <= 200"), "SQL subject length");
  assert(migration.includes("length(body_text) <= 20000"), "SQL body length");
  assert(migration.includes("attachment_count = 0"), "attachment_count pinned to 0");
  assert(migration.includes("body_html IS NULL"), "no HTML body in v1");
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)") &&
      migration.includes("FROM PUBLIC, anon, authenticated"),
    "finalize revoked from authenticated",
  );
  assert(
    !migration.includes(
      "GRANT EXECUTE ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)\n  TO authenticated",
    ),
    "finalize not granted to authenticated",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)\n  TO service_role",
    ),
    "finalize service_role only",
  );
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.reconcile_inbox_reply_status") &&
      migration.includes("FROM PUBLIC, anon, authenticated"),
    "reconcile revoked from authenticated",
  );
  assert(
    !migration.includes("public.email_logs") && !migration.includes("INTO email_logs"),
    "must not touch application email log tables",
  );

  // --- Isolation ---
  assert(smtpConfig.includes('import "server-only"'), "smtp-config server-only");
  assert(smtpClient.includes('import "server-only"'), "smtp-client server-only");
  assert(!smtpClient.includes("@/lib/email"), "smtp-client no Resend import");
  assert(!actions.includes('from "@/lib/email'), "actions still no Resend");
  assert(!sync.includes('from "@/lib/email'), "sync still no Resend");
  assert(!actions.includes("sendInboxSmtpMail"), "Phase 1: no send wired in actions yet");
  assert(!detailUi.includes("sendInboxReply"), "Phase 1: no reply UI action yet");
  assert(sanitize.includes("INBOX_HTML_CSP"), "CSP preserved");
  assert(detailUi.includes('sandbox="allow-popups allow-popups-to-escape-sandbox"'), "sandbox preserved");
  assert(access.includes("canReplyInbox"), "canReplyInbox helper");
  assert(existsSync(join(process.cwd(), "src/lib/inbox/reply-validation.ts")), "validation module");

  // --- SMTP TLS / From (H3/H6) ---
  assert(smtpClient.includes("rejectUnauthorized: true"), "TLS cert verification");
  assert(smtpClient.includes("requireTLS"), "requireTLS configured");
  assert(smtpClient.includes("minVersion"), "TLS min version");
  assert(smtpClient.includes("isTlsFailure"), "TLS fail-closed classifier");
  assert(smtpClient.includes('outcome: "failed"'), "TLS → failed not uncertain");
  assert(smtpConfig.includes("INBOX_SMTP_FROM"), "explicit From env");
  assert(!smtpConfig.includes("INBOX_IMAP_USER"), "no IMAP From fallback");
  // Rejection of inbox.local is required; soft success fallbacks are not.
  assert(!headers.includes('?? "inbox.local"'), "no inbox.local nullish fallback");
  assert(!headers.includes("?? 'inbox.local'"), "no inbox.local nullish fallback quotes");
  assert(!headers.includes('|| "inbox.local"'), "no inbox.local OR fallback");
  assert(!headers.includes("|| 'inbox.local'"), "no inbox.local OR fallback quotes");
  assert(lifecycle.includes("reconcile_inbox_reply_status"), "reconcile procedure documented");
  assert(INBOX_REPLY_RECONCILE_PROCEDURE.length >= 4, "reconcile steps present");

  // --- RBAC ---
  assert(ROLE_PERMISSIONS.ADMIN.includes("inbox.reply"), "ADMIN has inbox.reply");
  assert(
    !ROLE_PERMISSIONS.COMMUNICATION_MANAGER.includes("inbox.reply"),
    "COMMUNICATION_MANAGER excluded",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["ADMIN"],
      overrides: [],
      permission: "inbox.reply",
    }),
    "ADMIN inbox.reply PASS",
  );

  // --- Recipient / injection / draft ---
  const locked = assertReplyRecipientLocked({
    requestedTo: "Sender@Example.com",
    originalFromAddress: "sender@example.com",
  });
  assert(locked.ok && locked.toAddress === "sender@example.com", "recipient lock ok");
  assert(
    !assertReplyRecipientLocked({
      requestedTo: "other@example.com",
      originalFromAddress: "sender@example.com",
    }).ok,
    "recipient mismatch blocked",
  );
  assert(normalizeReplySubject("", "Hallo") === "Re: Hallo", "Re prefix");
  assert(containsHeaderInjection("Betreff\nBcc: evil@x"), "CRLF detected");
  assert(!validateReplySubject("ok\r\ninject").ok, "subject injection rejected");
  const draft = validateInboxReplyDraft({
    requestedTo: "a@b.co",
    originalFromAddress: "a@b.co",
    subject: "Frage",
    originalSubject: "Frage",
    bodyText: "Danke für Ihre Nachricht.",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  });
  assert(draft.ok && draft.subject.startsWith("Re:"), "draft ok");
  assert(!validateIdempotencyKey("not-a-uuid").ok, "bad idempotency rejected");

  // --- Message-ID domain (H3) ---
  assert(messageIdDomainFromEmail("turnier@vfl-kirchheim.de") === "vfl-kirchheim.de", "domain from From");
  assert(messageIdDomainFromEmail("x@inbox.local") == null, "reject inbox.local email");
  assert(assertMessageIdDomain("inbox.local") == null, "reject inbox.local domain");
  assert(resolveMessageIdDomain({}) == null, "no silent domain default");
  let threw = false;
  try {
    buildInboxReplyThreadingHeaders({
      parentMessageIdHeader: null,
      parentInReplyTo: null,
      parentReferencesHeader: null,
      messageIdDomain: "inbox.local",
    });
  } catch {
    threw = true;
  }
  assert(threw, "build throws on inbox.local");

  const threaded = buildInboxReplyThreadingHeaders({
    parentMessageIdHeader: "<Parent@Example.com>",
    parentInReplyTo: "<older@example.com>",
    parentReferencesHeader: "<root@example.com> <older@example.com>",
    messageIdDomain: "vfl-kirchheim.de",
  });
  assert(threaded.inReplyToHeader === "<parent@example.com>", "In-Reply-To");
  assert(
    Boolean(
      threaded.referencesHeader?.includes("<root@example.com>") &&
        threaded.referencesHeader?.includes("<parent@example.com>"),
    ),
    "References chain",
  );
  assert(
    Boolean(normalizeMessageIdHeader(threaded.messageIdHeader)?.endsWith("@vfl-kirchheim.de")),
    "Message-ID uses configured domain",
  );

  // --- Lifecycle / rate limit / uncertain (H1/H4) ---
  assert(
    isStaleSending({
      status: "sending",
      createdAtMs: Date.now() - 16 * 60 * 1000,
      nowMs: Date.now(),
    }),
    "stale sending detected",
  );
  assert(
    normalizeStatusForClaimGate({
      status: "sending",
      createdAtMs: Date.now() - 16 * 60 * 1000,
      nowMs: Date.now(),
    }) === "uncertain",
    "stale sending normalized to uncertain",
  );
  assert(hasUnresolvedReplyBlocker("uncertain"), "uncertain blocks new keys");
  assert(hasUnresolvedReplyBlocker("sending"), "sending blocks new keys");
  const rateBlocked = applyReplyClaimTransition({
    existingForKey: null,
    unresolvedForParent: false,
    rateLimited: true,
  });
  assert(rateBlocked.errorCode === "rate_limited" && !rateBlocked.sendAllowed, "rate limit gate");
  const unresolvedBlocked = applyReplyClaimTransition({
    existingForKey: null,
    unresolvedForParent: true,
    rateLimited: false,
  });
  assert(
    unresolvedBlocked.errorCode === "unresolved_reply_exists" && !unresolvedBlocked.sendAllowed,
    "unresolved blocks new idempotency key",
  );
  const fresh = applyReplyClaimTransition({
    existingForKey: null,
    unresolvedForParent: false,
    rateLimited: false,
  });
  assert(fresh.sendAllowed && fresh.status === "sending", "fresh claim");
  const replay = applyReplyClaimTransition({
    existingForKey: { status: "uncertain" },
    unresolvedForParent: false,
    rateLimited: false,
  });
  assert(!replay.sendAllowed && replay.alreadyExisted, "replay no send");
  assert(!shouldAutoRetrySmtp("uncertain"), "never auto-retry");
  assert(blocksAutoResend("sending"), "sending blocks resend");
  assert(
    mayInvokeSmtpAfterClaim({ sendAllowed: true, status: "sending" }),
    "SMTP only after fresh claim",
  );
  assert(finalizeStatusForSmtpResult({ outcome: "uncertain" }) === "uncertain", "timeout→uncertain");
  assert(
    applyReplyFinalizeTransition({ current: "sending", next: "uncertain" }).ok,
    "finalize sending→uncertain",
  );
  assert(
    !applyReplyFinalizeTransition({ current: "uncertain", next: "sent" }).ok,
    "no finalize from uncertain via SMTP finalize path",
  );
  assert(
    applyReplyReconcileTransition({ current: "uncertain", next: "failed" }).ok,
    "manual reconcile uncertain→failed",
  );
  assert(
    !applyReplyReconcileTransition({ current: "sent", next: "failed" }).ok,
    "cannot reconcile terminal sent",
  );
  assert(isInboxReplyRateLimited({ recentCount: 20 }), "rate limit at max");
  assert(!isInboxReplyRateLimited({ recentCount: 19 }), "under rate limit");

  // --- Secret-safe errors ---
  assert(smtpClient.includes("[redacted]"), "password redaction");
  assert(!smtpClient.includes("console.log"), "no console.log in smtp-client");

  return "ok";
}
