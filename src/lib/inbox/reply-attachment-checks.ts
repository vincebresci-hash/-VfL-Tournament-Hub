import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  INBOX_REPLY_ATTACHMENT_MAX_COUNT,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES,
} from "@/lib/inbox/reply-attachment-limits";
import { INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES } from "@/lib/inbox/reply-attachment-phase4b-notes";
import {
  INBOX_REPLY_ZIP_BOMB_RESIDUAL_RISK,
  assertReplyAttachmentDeclaredSize,
  countZipLocalHeaders,
  isValidOoxmlStructure,
  looksLikeActiveReplyAttachmentContent,
  validateInboxReplyAttachmentBytes,
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

/** Minimal ZIP-shaped OOXML-ish buffer with required markers (+ optional XML decl). */
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
  const actions = read("src/lib/inbox/actions.ts");
  const attachmentActions = read("src/lib/inbox/reply-attachment-actions.ts");
  const sendCore = read("src/lib/inbox/reply-send.ts");
  const composerUi = read("src/components/admin/inbox/InboxReplyComposer.tsx");
  const sync = read("src/lib/inbox/sync.ts");
  const detailUi = read("src/components/admin/InboxMessageDetail.tsx");

  // --- Migration contracts ---
  assert(migration.includes("BEGIN;") && migration.includes("COMMIT;"), "transactional migration");
  assert(migration.includes("inbox-reply-attachments"), "private outbound bucket");
  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.inbox_reply_uploads"), "uploads table");
  assert(migration.includes("87235201"), "H2 actor advisory lock key");
  assert(migration.includes("87235202"), "H2 actor+parent advisory lock key");
  assert(migration.includes("pg_advisory_xact_lock"), "H2 advisory locks present");
  assert(migration.includes("inbox_reply_upload_is_purge_eligible"), "H1 shared eligibility");
  assert(migration.includes("reply.status IN ('sending', 'uncertain')"), "H1 uncertain/sending guard");
  assert(migration.includes("is_inbox_reply_upload_mime_allowed"), "H5 SQL MIME allowlist");
  assert(migration.includes("get_inbox_reply_upload_storage_path"), "H3 service_role path getter");
  assert(
    migration.includes("GRANT SELECT (\n  id,"),
    "H3 column-level SELECT without storage_path",
  );
  assert(
    migration.includes(
      "REVOKE ALL ON TABLE public.inbox_reply_uploads FROM PUBLIC, anon, authenticated",
    ),
    "H3 clears default SELECT before column grant",
  );
  assert(!migration.includes("storage_path\n) ON TABLE public.inbox_reply_uploads TO authenticated"), "path not granted");
  assert(migration.includes("RETURNS TABLE (\n  upload_id uuid,\n  error_code text\n)"), "create RPC no path");
  assert(migration.includes("committed = false"), "M4 lease required for commit");
  assert(migration.includes("p_checksum_sha256 !~ '^[0-9a-fA-F]{64}$'"), "checksum hex format");
  assert(migration.includes("GREATEST(COALESCE(p_retain_days, 30), 30)"), "retention floor 30d");
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.inbox_reply_upload_extension(text) FROM PUBLIC, anon, authenticated"),
    "helper EXECUTE revoked",
  );
  assert(migration.includes("quota_count"), "per-parent count quota");
  assert(migration.includes("12582912"), "12 MiB quota bytes");
  assert(!migration.includes("public.email_logs"), "no Resend/email_logs touch");
  assert(!migration.includes("upsert_inbox_attachment_from_sync"), "no IMAP attachment upsert changes");

  // --- Action wiring ---
  assert(actions.includes("uploadInboxReplyAttachmentAction"), "upload action exported");
  assert(actions.includes("removeInboxReplyAttachmentAction"), "remove action exported");
  assert(attachmentActions.includes("assertReplyAttachmentDeclaredSize"), "H4 pre-buffer size check");
  assert(
    attachmentActions.indexOf("assertReplyAttachmentDeclaredSize") <
      attachmentActions.indexOf("arrayBuffer()"),
    "H4 file.size check before arrayBuffer",
  );
  assert(attachmentActions.includes("get_inbox_reply_upload_storage_path"), "H3 path via service_role");
  assert(attachmentActions.includes("verifyStoredObjectSize"), "M4/M5 object size verify");
  assert(attachmentActions.includes("removeError"), "M3 storage delete checked");
  assert(!attachmentActions.includes("@/lib/email"), "no Resend in attachment actions");
  assert(
    !attachmentActions.includes('.select(\n      "id, filename, content_type, storage_path'),
    "authenticated select must not request storage_path",
  );

  // --- Send still rejects attachments until 4b ---
  assert(sendCore.includes("attachments_not_supported"), "attachments_not_supported preserved");
  assert(composerUi.includes("disabled"), "attachment control still disabled");
  assert(!composerUi.includes("uploadInboxReplyAttachmentAction"), "composer not wired yet");
  assert(!sync.includes("inbox_reply_uploads"), "IMAP sync isolation");
  assert(detailUi.includes('sandbox="allow-popups allow-popups-to-escape-sandbox"'), "sandbox preserved");

  // --- Limits / notes ---
  assert(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES === 5 * 1024 * 1024, "5 MiB per file");
  assert(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES === 12 * 1024 * 1024, "12 MiB total");
  assert(INBOX_REPLY_ATTACHMENT_MAX_COUNT === 5, "5 files max");
  assert(INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.rejectFileSizeBeforeBuffer === true, "H4 documented");
  assert(
    INBOX_REPLY_ATTACHMENT_PHASE4B_HOBBY_NOTES.zipBombResidualClientSideOnly === true,
    "M2 residual documented",
  );
  assert(INBOX_REPLY_ZIP_BOMB_RESIDUAL_RISK.includes("ZIP bombs"), "M2 residual string");

  // --- Validation behavior ---
  const oversizedMeta = assertReplyAttachmentDeclaredSize(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES + 1);
  assert(!oversizedMeta.ok && oversizedMeta.code === "size_rejected", "H4 declared size reject");

  const pdf = validateInboxReplyAttachmentBytes({
    filename: "plan.pdf",
    contentType: "application/pdf",
    content: minimalPdf(),
  });
  assert(pdf.ok === true, "pdf accepted");

  const png = validateInboxReplyAttachmentBytes({
    filename: "a.png",
    contentType: "image/png",
    content: minimalPng(),
  });
  assert(png.ok === true, "png accepted");

  const jpg = validateInboxReplyAttachmentBytes({
    filename: "a.jpg",
    contentType: "image/jpeg",
    content: minimalJpeg(),
  });
  assert(jpg.ok === true, "jpg accepted");

  const docx = validateInboxReplyAttachmentBytes({
    filename: "brief.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: minimalOoxml("docx", true),
  });
  assert(docx.ok === true, "M1 docx with <?xml accepted");
  assert(
    !looksLikeActiveReplyAttachmentContent(minimalOoxml("docx", true), {
      allowXmlDeclaration: true,
    }),
    "M1 xml allowed for ooxml",
  );
  assert(
    looksLikeActiveReplyAttachmentContent(Buffer.from("%PDF-1.4\n<html><script>x</script>")),
    "html polyglot still blocked",
  );

  const xlsx = validateInboxReplyAttachmentBytes({
    filename: "liste.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: minimalOoxml("xlsx"),
  });
  assert(xlsx.ok === true, "xlsx accepted");
  assert(isValidOoxmlStructure(minimalOoxml("docx"), "docx"), "docx ooxml helper");
  assert(countZipLocalHeaders(minimalOoxml("docx")) >= 1, "local header counted");

  const badExt = validateInboxReplyAttachmentBytes({
    filename: "x.exe",
    contentType: "application/octet-stream",
    content: minimalPdf(),
  });
  assert(!badExt.ok && badExt.code === "extension_blocked", "exe blocked");

  const mismatch = validateInboxReplyAttachmentBytes({
    filename: "fake.pdf",
    contentType: "application/pdf",
    content: minimalPng(),
  });
  assert(!mismatch.ok && mismatch.code === "magic_mismatch", "magic mismatch blocked");

  const htmlPolyglot = validateInboxReplyAttachmentBytes({
    filename: "x.pdf",
    contentType: "application/pdf",
    content: Buffer.from("%PDF-1.4\n<html><script>alert(1)</script>"),
  });
  assert(!htmlPolyglot.ok && htmlPolyglot.code === "content_sniff_blocked", "html polyglot blocked");

  const oversized = validateInboxReplyAttachmentBytes({
    filename: "big.pdf",
    contentType: "application/pdf",
    content: Buffer.concat([minimalPdf(), Buffer.alloc(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES)]),
  });
  assert(!oversized.ok && oversized.code === "size_rejected", "oversized blocked");

  const badZip = validateInboxReplyAttachmentBytes({
    filename: "bad.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: Buffer.from("PK\u0003\u0004not-ooxml"),
  });
  assert(!badZip.ok && badZip.code === "ooxml_invalid", "invalid ooxml blocked");

  assert(
    existsSync(join(process.cwd(), "scripts/ci/inbox-sql/reply-attachment-tests.mjs")),
    "SQL attachment tests module",
  );
  const sqlTests = read("scripts/ci/inbox-sql/reply-attachment-tests.mjs");
  assert(sqlTests.includes("concurrent creates cannot exceed"), "H2 concurrency test");
  assert(sqlTests.includes("storage_path hidden"), "H3 path exposure test");
  assert(sqlTests.includes("mark_purged refuses"), "H1 purge safety test");
  assert(sqlTests.includes("SQL MIME allowlist"), "H5 MIME test");
  assert(sqlTests.includes("cross-user SELECT isolation"), "M6 isolation test");

  return "ok";
}
