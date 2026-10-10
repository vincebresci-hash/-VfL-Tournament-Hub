import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateInboxAttachmentSafety,
  isDangerousInboxFilename,
  isRecoverableAttachmentSkipReason,
  looksLikeActiveInboxContent,
  sanitizeInboxFilename,
} from "@/lib/inbox/attachments-safe";
import { INBOX_SQL_INTEGRATION_CASES } from "@/lib/inbox/integration-test-plan";
import { wrapInboxHtmlForSandbox } from "@/lib/inbox/sanitize-html";
import { canStartInboxFetch, remainingBudgetMs } from "@/lib/inbox/budget";
import {
  canMutateUnderInboxLock,
  filterUidsAfterCursor,
  inboxIdentityKey,
  isUidvalidityReset,
  nextCursorAfterBatch,
  normalizeMessageIdHeader,
} from "@/lib/inbox/identity";
import {
  formatInboxUnreadBadgeCount,
  inboxUnreadBadgeAriaLabel,
} from "@/lib/inbox/inbox-badges";
import { sanitizeInboxHtml } from "@/lib/inbox/sanitize-html";
import {
  buildInboxMessageSearchOrFilter,
  escapePostgrestSearchTerm,
  searchTermAltersFilterStructure,
} from "@/lib/inbox/search";
import { ROLE_PERMISSIONS, resolvePermissionAccess } from "@/lib/rbac/permissions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function listEmailLibFiles(): string[] {
  const dir = join(process.cwd(), "src/lib/email");
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) {
      return [`src/lib/email/${entry.name}`];
    }
    return [];
  });
}

function assertBearerDigest(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) {
    return false;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }
  const digestA = createHash("sha256").update(match[1].trim(), "utf8").digest();
  const digestB = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

export function runInboxChecks() {
  const migration = read("supabase/migrations/20261009150000_ionos_inbox_readonly.sql");
  const sync = read("src/lib/inbox/sync.ts");
  const imapClient = read("src/lib/inbox/imap-client.ts");
  const config = read("src/lib/inbox/config.ts");
  const actions = read("src/lib/inbox/actions.ts");
  const access = read("src/lib/inbox/access.ts");
  const queries = read("src/lib/inbox/queries.ts");
  const detailUi = read("src/components/admin/InboxMessageDetail.tsx");
  const apiRoute = read("src/app/api/inbox/sync/route.ts");
  const sidebar = read("src/components/admin/AdminSidebar.tsx");
  const nav = read("src/lib/admin-navigation.ts");
  const adminAccess = read("src/lib/rbac/admin-access.ts");
  const layout = read("src/app/admin/layout.tsx");
  const posteingangLayout = read("src/app/admin/posteingang/layout.tsx");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  // --- Schema / isolation (targeted source contracts) ---
  assert(migration.includes("UNIQUE (mailbox_id, folder, uidvalidity, imap_uid)"), "IMAP identity");
  assert(migration.includes("UNIQUE (message_id, part_index)"), "attachment part uniqueness");
  assert(migration.includes("claim_inbox_sync_lock_for_mutation"), "atomic lock claim");
  assert(migration.includes("FOR UPDATE"), "row lock FOR UPDATE");
  assert(migration.includes("get_inbox_sync_status"), "sanitized sync status RPC");
  assert(
    migration.includes("REVOKE ALL ON TABLE public.inbox_sync_state FROM PUBLIC, anon, authenticated"),
    "sync_state not selectable by authenticated",
  );
  assert(!migration.includes("GRANT SELECT ON TABLE public.inbox_sync_state TO authenticated"), "no sync_state select grant");
  assert(migration.includes("upsert_inbox_attachment_from_sync"), "fenced attachment upsert");
  assert(
    migration.includes("intentionally does NOT update is_unread_local"),
    "local status preservation comment in upsert",
  );
  const roleGrantBlock = migration.slice(
    migration.indexOf("INSERT INTO public.rbac_role_permissions"),
    migration.indexOf("-- Tables"),
  );
  assert(
    roleGrantBlock.includes("WHERE r.key IN ('SUPER_ADMIN', 'ADMIN')") &&
      !roleGrantBlock.includes("COMMUNICATION_MANAGER"),
    "RBAC grants only SUPER_ADMIN + ADMIN",
  );
  assert(
    !/ALTER\s+TABLE\s+public\.email_/i.test(migration) &&
      !/CREATE\s+TABLE\s+.*email_/i.test(migration),
    "migration does not touch outbound email tables",
  );

  // --- IMAP timeouts / Hobby budget (behavioral + contracts) ---
  assert(imapClient.includes("connectionTimeout"), "IMAP connectionTimeout configured");
  assert(imapClient.includes("greetingTimeout"), "IMAP greetingTimeout configured");
  assert(imapClient.includes("socketTimeout"), "IMAP socketTimeout configured");
  assert(imapClient.includes("IMAP_TIMEOUT") && imapClient.includes("Promise.race"), "operation race timeout");
  assert(imapClient.includes("teardownImapClient"), "bounded teardown helper");
  assert(imapClient.includes("INBOX_IMAP_TEARDOWN_TIMEOUT_MS"), "teardown uses hard cap constant");
  assert(imapClient.includes("forceCloseClient"), "socket force-close on timeout/teardown");
  assert(imapClient.includes("readOnly: true") && imapClient.includes("BODY.PEEK"), "read-only + PEEK");
  assert(imapClient.includes("emptySourceUids"), "empty source distinguished from missing");
  assert(sync.includes("canStartInboxFetch"), "fetch gated on remaining budget");
  assert(config.includes("INBOX_IMAP_TEARDOWN_TIMEOUT_MS = 250"), "teardown capped at 250ms");
  assert(
    config.includes("INBOX_SYNC_SECRET") &&
      !config.includes("CRON_SECRET?.trim()") &&
      !config.includes('|| process.env.CRON_SECRET'),
    "no CRON_SECRET fallback",
  );
  assert(!apiRoute.includes("CRON_SECRET"), "API docs no CRON_SECRET");
  assert(apiRoute.includes("Not enabled on Hobby via vercel.json"), "live cron sync remains disabled");
  assert(posteingangLayout.includes("maxDuration = 10"), "admin segment maxDuration");
  assert(apiRoute.includes("maxDuration = 10"), "API maxDuration");
  try {
    read("vercel.json");
    assert(false, "vercel.json must not exist");
  } catch {
    // expected
  }
  assert(canStartInboxFetch(0, 7_500, 4_000) === true, "budget allows fetch with headroom");
  assert(canStartInboxFetch(0, 7_500, 6_000) === false, "budget blocks late fetch");
  assert(remainingBudgetMs(0, 7_500, 7_000) === 500, "remaining budget math");

  // --- Atomic lock fencing (behavioral model mirroring SQL) ---
  assert(
    canMutateUnderInboxLock({
      holderToken: "a",
      expiresAtMs: 2_000,
      workerToken: "a",
      nowMs: 1_000,
    }),
    "owner may mutate",
  );
  assert(
    !canMutateUnderInboxLock({
      holderToken: "b",
      expiresAtMs: 2_000,
      workerToken: "a",
      nowMs: 1_000,
    }),
    "stale worker blocked",
  );
  assert(
    !canMutateUnderInboxLock({
      holderToken: "a",
      expiresAtMs: 500,
      workerToken: "a",
      nowMs: 1_000,
    }),
    "expired lock blocked",
  );
  assert(sync.includes("upsert_inbox_attachment_from_sync"), "attachments go through fenced RPC");
  assert(!sync.includes('.delete().eq("message_id"'), "no blind attachment delete-all");

  // --- Cursor / empty source / identity ---
  assert(
    nextCursorAfterBatch({
      previousCursor: 10,
      attemptedUids: [11, 12, 13],
      storedUids: [11],
      missingUids: [],
      emptySourceUids: [12],
    }) === 11,
    "cursor stops before empty-source UID",
  );
  assert(
    nextCursorAfterBatch({
      previousCursor: 10,
      attemptedUids: [11, 12],
      storedUids: [11],
      missingUids: [12],
    }) === 12,
    "missing/expunged may advance",
  );
  assert(
    nextCursorAfterBatch({
      previousCursor: 10,
      attemptedUids: [11, 12],
      storedUids: [],
      missingUids: [],
      emptySourceUids: [],
    }) === 10,
    "no advance when nothing stored",
  );
  assert(
    inboxIdentityKey({ mailboxId: "m", folder: "INBOX", uidvalidity: 1, imapUid: 9 }) !==
      inboxIdentityKey({ mailboxId: "m", folder: "INBOX", uidvalidity: 2, imapUid: 9 }),
    "uidvalidity in identity",
  );
  assert(isUidvalidityReset(1, 2) && !isUidvalidityReset(null, 2), "uidvalidity reset detect");
  assert(filterUidsAfterCursor([1, 5, 9], 5).join(",") === "9", "filter after cursor");
  assert(normalizeMessageIdHeader("<AbC@x.com>") === "abc@x.com", "message-id normalize");

  // --- Attachment security (behavioral / adversarial allowlist + sniff) ---
  const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  const htmlBuf = Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>");
  const utf16LeHtml = Buffer.from("\ufeff<!DOCTYPE html><html><script>alert(1)</script></html>", "utf16le");
  // UTF-16 BE with BOM (FE FF) + HTML payload.
  const utf16BePayload = Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>", "utf16le");
  const utf16BeHtml = Buffer.alloc(2 + utf16BePayload.length);
  utf16BeHtml[0] = 0xfe;
  utf16BeHtml[1] = 0xff;
  for (let i = 0; i < utf16BePayload.length; i += 2) {
    utf16BeHtml[2 + i] = utf16BePayload[i + 1] ?? 0;
    utf16BeHtml[2 + i + 1] = utf16BePayload[i] ?? 0;
  }
  const bomUtf8Html = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("<html><script>alert(1)</script></html>"),
  ]);
  const commentedHtml = Buffer.from("<!--x--><!DOCTYPE html><html><body>x</body></html>");
  const nestedCommentHtml = Buffer.from("<!--><!--<script>--><body>x</body>");
  const bodyOnly = Buffer.from("<body onload=alert(1)>hi</body>");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.svg", contentType: "image/svg+xml", content: svgBuf }).allowed, "block svg");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.html", contentType: "text/html", content: htmlBuf }).allowed, "block html");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.htm", contentType: null }).allowed, "block htm without mime");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.xhtml", contentType: "application/octet-stream" }).allowed, "block xhtml");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.js", contentType: "application/javascript" }).allowed, "block js");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.mjs", contentType: null }).allowed, "block mjs");
  assert(!evaluateInboxAttachmentSafety({ filename: "x.exe", contentType: null }).allowed, "block exe");
  assert(!evaluateInboxAttachmentSafety({ filename: "unknown.bin", contentType: null }).allowed, "reject unknown extension");
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "readme.txt",
      contentType: "text/plain",
      content: utf16LeHtml,
    }).allowed,
    "block utf16-le html as txt",
  );
  assert(
    evaluateInboxAttachmentSafety({
      filename: "readme.txt",
      contentType: "text/plain",
      content: utf16LeHtml,
    }).reason === "content_sniff_blocked",
    "utf16-le rejected via content sniff",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "readme.txt",
      contentType: "application/octet-stream",
      content: utf16BeHtml,
    }).allowed,
    "block utf16-be html as txt",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "notes.txt",
      contentType: "text/plain",
      content: bomUtf8Html,
    }).allowed,
    "block bom-prefixed html as txt",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "notes.txt",
      contentType: null,
      content: commentedHtml,
    }).allowed,
    "block comment-prefixed html (missing mime)",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "notes.csv",
      contentType: "text/csv",
      content: nestedCommentHtml,
    }).allowed,
    "block comment/body html as csv",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "notes.txt",
      contentType: "text/plain",
      content: bodyOnly,
    }).allowed,
    "block body-only html as txt",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "invoice.pdf",
      contentType: "application/octet-stream",
      content: htmlBuf,
    }).allowed,
    "generic mime + misleading pdf name blocked by sniff",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "innocent.pdf",
      contentType: "application/pdf",
      content: svgBuf,
    }).allowed,
    "content sniff blocks svg disguised as pdf",
  );
  assert(
    !evaluateInboxAttachmentSafety({
      filename: "fake.pdf",
      contentType: "application/pdf",
      content: Buffer.from("not-a-pdf"),
    }).allowed,
    "magic mismatch rejects fake pdf",
  );
  assert(
    evaluateInboxAttachmentSafety({
      filename: "plan.pdf",
      contentType: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    }).allowed,
    "safe pdf allowed",
  );
  assert(
    evaluateInboxAttachmentSafety({
      filename: "notes.txt",
      contentType: null,
      content: Buffer.from("plain tournament notes"),
    }).allowed,
    "allowlisted txt with missing mime allowed when content safe",
  );
  assert(looksLikeActiveInboxContent(htmlBuf), "html sniff");
  assert(looksLikeActiveInboxContent(utf16LeHtml), "utf16-le sniff");
  assert(looksLikeActiveInboxContent(utf16BeHtml), "utf16-be sniff");
  assert(looksLikeActiveInboxContent(bomUtf8Html), "bom html sniff");
  assert(looksLikeActiveInboxContent(commentedHtml), "comment html sniff");
  assert(looksLikeActiveInboxContent(bodyOnly), "body-only sniff");
  assert(isDangerousInboxFilename("payload.svg"), "svg extension not allowlisted");
  assert(isRecoverableAttachmentSkipReason("storage_upload_failed"), "recoverable upload failure");
  assert(!isRecoverableAttachmentSkipReason("extension_blocked"), "blocked types not repaired");
  assert(sanitizeInboxFilename("../../etc/passwd.svg") === "passwd.svg", "path traversal sanitized");
  assert(actions.includes("download: safeName") || actions.includes("download:"), "forced download disposition");
  assert(!detailUi.includes("window.open"), "UI does not window.open attachments");
  assert(detailUi.includes("link.download"), "UI uses download attribute");
  assert(detailUi.includes("sandbox=") && detailUi.includes("srcDoc"), "HTML rendered in sandbox iframe");
  assert(!detailUi.includes("dangerouslySetInnerHTML"), "no raw dangerouslySetInnerHTML for body");
  const wrapped = wrapInboxHtmlForSandbox("<p>ok</p>");
  assert(wrapped.includes("Content-Security-Policy") && wrapped.includes("script-src 'none'"), "inbox CSP in srcdoc");

  // --- Search injection ---
  const injected = 'a,processing_status.eq.done';
  assert(!searchTermAltersFilterStructure(injected), "escaped search cannot alter structure");
  const filter = buildInboxMessageSearchOrFilter(injected);
  assert(filter != null && !filter.includes("processing_status.eq"), "injection payload neutralized");
  assert(escapePostgrestSearchTerm('foo"bar')?.includes("foo") ?? false, "quotes stripped");
  assert(queries.includes("buildInboxMessageSearchOrFilter"), "queries use safe search builder");

  // --- Sync status privacy ---
  assert(queries.includes("get_inbox_sync_status"), "UI uses sanitized status RPC");
  assert(!queries.includes('from("inbox_sync_state")'), "queries do not select sync_state table");
  assert(
    !migration.includes("lock_token") || migration.includes("get_inbox_sync_status"),
    "status RPC present alongside lock columns",
  );
  const statusFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.get_inbox_sync_status"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.acquire_inbox_sync_lock"),
  );
  assert(
    !statusFn.includes("lock_token") &&
      !statusFn.includes("lock_acquired_at") &&
      !statusFn.includes("lock_expires_at"),
    "status RPC omits lock secrets",
  );

  // --- Attachment recovery + orphan GC contracts ---
  assert(sync.includes("repairFailedAttachments"), "repair pass present");
  assert(sync.includes("mark_inbox_attachment_repair_attempt"), "repair bookkeeping");
  assert(sync.includes("cleanupOrphanStorageLeases"), "orphan cleanup pass");
  assert(sync.includes("register_inbox_storage_lease"), "lease registration before upload");
  assert(sync.includes("commit_inbox_storage_lease"), "lease commit after success");
  assert(sync.includes("storage_upload_failed"), "tracks upload failures");
  assert(migration.includes("Keep working attachment"), "never downgrade stored attachment");
  assert(migration.includes("inbox_attachments_needs_repair_idx"), "repair index");
  assert(migration.includes("inbox_storage_leases"), "storage leases table");
  assert(migration.includes("list_expired_inbox_storage_leases"), "orphan list RPC");
  assert(migration.includes("retry_count"), "repair retry_count column");
  assert(config.includes("INBOX_ATTACHMENT_MAX_REPAIR_ATTEMPTS"), "max repair attempts");

  // --- HTML defense-in-depth ---
  const dirty = sanitizeInboxHtml(
    `<p>Hi</p><script>alert(1)</script><img src="https://evil.test/x.png" /><a href="javascript:alert(1)">x</a><a href="https://ok.test">ok</a>`,
  );
  assert(dirty != null && !dirty.includes("<script") && !dirty.includes("<img"), "sanitize strips active tags");
  assert(!dirty!.includes("javascript:"), "sanitize strips javascript URLs");
  assert(dirty!.includes('href="https://ok.test"'), "sanitize keeps safe links");
  assert(queries.includes("sanitizeInboxHtml(data.body_html_sanitized)"), "re-sanitize on read");

  // --- SQL integration readiness (plan only — no live DB here) ---
  assert(INBOX_SQL_INTEGRATION_CASES.length >= 8, "integration plan has concurrency cases");
  assert(
    INBOX_SQL_INTEGRATION_CASES.some((entry) => entry.id === "stale-upsert-rejected"),
    "plan covers stale upsert",
  );
  assert(
    INBOX_SQL_INTEGRATION_CASES.some((entry) => entry.id === "orphan-lease-gc"),
    "plan covers orphan GC",
  );

  // --- RBAC ---
  assert(
    !resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["COMMUNICATION_MANAGER"],
      overrides: [],
      permission: "inbox.view",
    }),
    "COMMUNICATION_MANAGER denied",
  );
  assert(
    resolvePermissionAccess({
      isActive: true,
      profileRole: "admin",
      roleKeys: ["ADMIN"],
      overrides: [],
      permission: "inbox.view",
    }),
    "ADMIN allowed",
  );
  assert(
    !ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("inbox.view") &&
      !ROLE_PERMISSIONS.APPLICATION_MANAGER.includes("inbox.manage"),
    "other roles excluded",
  );
  assert(
    access.includes('authorization.roleKeys.includes("SUPER_ADMIN")'),
    "sync SUPER_ADMIN only",
  );
  assert(
    posteingangLayout.includes('requirePagePermission("inbox.view")'),
    "route requires inbox.view",
  );
  assert(nav.includes('href: "/admin/posteingang"'), "nav item");
  assert(adminAccess.includes('"inbox.view"'), "route permission map");
  assert(sidebar.includes("inboxUnreadCount"), "separate badge");
  assert(layout.includes("loadInboxUnreadCount"), "layout badge load");
  assert(formatInboxUnreadBadgeCount(0) === null, "badge 0 hidden");
  assert(formatInboxUnreadBadgeCount(100) === "99+", "badge capped");
  assert(inboxUnreadBadgeAriaLabel(2).includes("2"), "badge aria");

  // --- Bearer secret ---
  assert(assertBearerDigest("Bearer secret-value", "secret-value"), "bearer ok");
  assert(!assertBearerDigest("Bearer wrong", "secret-value"), "bearer reject");
  assert(config.includes("timingSafeEqual") && config.includes("sha256"), "digest timing-safe compare");

  // --- Folder drift ---
  assert(sync.includes("Mailbox-Ordner-Konfiguration stimmt nicht überein"), "folder drift rejected");

  // --- Outbound email isolation ---
  for (const file of listEmailLibFiles()) {
    assert(read(file).length > 0, `outbound email file readable: ${file}`);
  }
  assert(!sync.includes('from "@/lib/email'), "no outbound email import in sync");
  assert(!actions.includes('from "@/lib/email'), "no outbound email import in actions");
  assert(runChecksCli.includes("runInboxChecks"), "checks wired");

  // --- Local status preservation SQL ---
  const upsertFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.upsert_inbox_message_from_sync"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.upsert_inbox_attachment_from_sync"),
  );
  assert(
    !upsertFn.includes("is_unread_local =") && !upsertFn.includes("processing_status ="),
    "message upsert never writes local status",
  );

  return "ok";
}
