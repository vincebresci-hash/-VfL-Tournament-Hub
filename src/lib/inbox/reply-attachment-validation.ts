import { sanitizeInboxFilename, inboxFilenameExtension } from "@/lib/inbox/attachments-safe";
import {
  INBOX_REPLY_ATTACHMENT_EXTENSIONS,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_MIME_BY_EXT,
  type InboxReplyAttachmentExtension,
} from "@/lib/inbox/reply-attachment-limits";

export type InboxReplyAttachmentValidationError =
  | "empty_file"
  | "size_rejected"
  | "extension_blocked"
  | "mime_blocked"
  | "magic_mismatch"
  | "ooxml_invalid"
  | "content_sniff_blocked"
  | "filename_invalid"
  | "zip_structure_rejected";

export type InboxReplyAttachmentValidationResult =
  | {
      ok: true;
      filename: string;
      extension: InboxReplyAttachmentExtension;
      contentType: string;
      sizeBytes: number;
    }
  | {
      ok: false;
      code: InboxReplyAttachmentValidationError;
      message: string;
    };

const EXT_SET = new Set<string>(INBOX_REPLY_ATTACHMENT_EXTENSIONS);

/** Soft structure limit: local-file headers in a ZIP without full extraction (M2). */
export const INBOX_REPLY_OOXML_MAX_LOCAL_HEADERS = 64;

/**
 * Residual ZIP/OOXML risk (M2):
 * We do not decompress archives server-side. Caps are compressed size (5 MiB),
 * local-header count, and required OOXML markers. A client that downloads and
 * expands an archive may still hit a decompression bomb — that residual risk
 * is accepted for Phase 4a and must stay documented for Phase 4b UX.
 */
export const INBOX_REPLY_ZIP_BOMB_RESIDUAL_RISK =
  "ZIP bombs are mitigated server-side by compressed-size and local-header limits only; no full unzip.";

function isReplyAttachmentExtension(value: string): value is InboxReplyAttachmentExtension {
  return EXT_SET.has(value);
}

const ACTIVE_HTML_MARKERS = [
  "<!doctype html",
  "<html",
  "<script",
  "<svg",
  "<iframe",
  "<object",
  "<embed",
] as const;

/**
 * Reject HTML/SVG/script polyglots.
 * M1: do not treat bare `<?xml` as active for OOXML packages (legitimate metadata).
 */
export function looksLikeActiveReplyAttachmentContent(
  content: Buffer,
  options?: { allowXmlDeclaration?: boolean },
): boolean {
  if (!content.length) {
    return false;
  }
  const head = content.subarray(0, Math.min(content.length, 2048)).toString("utf8").toLowerCase();
  if (ACTIVE_HTML_MARKERS.some((marker) => head.includes(marker))) {
    return true;
  }
  if (!options?.allowXmlDeclaration && head.includes("<?xml")) {
    return true;
  }
  return false;
}

function magicMatches(content: Buffer, ext: InboxReplyAttachmentExtension): boolean {
  if (content.length < 4) {
    return false;
  }
  if (ext === "pdf") {
    return content.subarray(0, 5).toString("utf8") === "%PDF-";
  }
  if (ext === "png") {
    return (
      content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47
    );
  }
  if (ext === "jpg" || ext === "jpeg") {
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (ext === "docx" || ext === "xlsx") {
    return content[0] === 0x50 && content[1] === 0x4b;
  }
  return false;
}

/** Count ZIP local-file headers (PK\\x03\\x04) without decompressing. */
export function countZipLocalHeaders(content: Buffer): number {
  let count = 0;
  for (let i = 0; i + 3 < content.length; i += 1) {
    if (
      content[i] === 0x50 &&
      content[i + 1] === 0x4b &&
      content[i + 2] === 0x03 &&
      content[i + 3] === 0x04
    ) {
      count += 1;
      if (count > INBOX_REPLY_OOXML_MAX_LOCAL_HEADERS) {
        return count;
      }
    }
  }
  return count;
}

/**
 * Lightweight OOXML structure check without unzipping.
 * Requires ZIP local header, [Content_Types].xml, package folder, and header cap.
 */
export function isValidOoxmlStructure(
  content: Buffer,
  kind: "docx" | "xlsx",
): boolean {
  if (content.length < 30 || content[0] !== 0x50 || content[1] !== 0x4b) {
    return false;
  }
  if (countZipLocalHeaders(content) > INBOX_REPLY_OOXML_MAX_LOCAL_HEADERS) {
    return false;
  }
  const haystack = content.toString("latin1");
  if (!haystack.includes("[Content_Types].xml")) {
    return false;
  }
  if (kind === "docx") {
    return haystack.includes("word/") || haystack.includes("word\\");
  }
  return haystack.includes("xl/") || haystack.includes("xl\\");
}

function normalizeDeclaredMime(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** H4 helper: reject oversized File metadata before buffering bytes. */
export function assertReplyAttachmentDeclaredSize(size: number): {
  ok: true;
} | {
  ok: false;
  code: "size_rejected";
  message: string;
} {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "size_rejected", message: "Datei ist leer." };
  }
  if (size > INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "size_rejected",
      message: `Datei darf höchstens ${INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES} Bytes haben.`,
    };
  }
  return { ok: true };
}

/**
 * Metadata-only validation before issuing a direct-upload authorization.
 * Does not inspect bytes (those are validated on finalize after Storage write).
 */
export function validateInboxReplyAttachmentMeta(input: {
  filename: string;
  contentType: string | null | undefined;
  sizeBytes: number;
}): InboxReplyAttachmentValidationResult {
  const sizeCheck = assertReplyAttachmentDeclaredSize(input.sizeBytes);
  if (!sizeCheck.ok) {
    return sizeCheck;
  }

  const filename = sanitizeInboxFilename(input.filename);
  if (!filename || (filename === "anhang" && !input.filename.trim())) {
    return { ok: false, code: "filename_invalid", message: "Dateiname ist ungültig." };
  }

  const ext = inboxFilenameExtension(filename);
  if (!isReplyAttachmentExtension(ext)) {
    return {
      ok: false,
      code: "extension_blocked",
      message: "Dateityp ist nicht erlaubt.",
    };
  }

  const declared = normalizeDeclaredMime(input.contentType);
  const allowedMimes = INBOX_REPLY_ATTACHMENT_MIME_BY_EXT[ext];
  if (!declared || !allowedMimes.includes(declared)) {
    return {
      ok: false,
      code: "mime_blocked",
      message: "Dateityp (MIME) ist nicht erlaubt.",
    };
  }

  return {
    ok: true,
    filename,
    extension: ext,
    contentType: declared,
    sizeBytes: input.sizeBytes,
  };
}

export function validateInboxReplyAttachmentBytes(input: {
  filename: string;
  contentType: string | null | undefined;
  content: Buffer;
}): InboxReplyAttachmentValidationResult {
  if (!input.content || input.content.length === 0) {
    return { ok: false, code: "empty_file", message: "Datei ist leer." };
  }
  if (input.content.length > INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "size_rejected",
      message: `Datei darf höchstens ${INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES} Bytes haben.`,
    };
  }

  const filename = sanitizeInboxFilename(input.filename);
  if (!filename || (filename === "anhang" && !input.filename.trim())) {
    return { ok: false, code: "filename_invalid", message: "Dateiname ist ungültig." };
  }

  const ext = inboxFilenameExtension(filename);
  if (!isReplyAttachmentExtension(ext)) {
    return {
      ok: false,
      code: "extension_blocked",
      message: "Dateityp ist nicht erlaubt.",
    };
  }

  const declared = normalizeDeclaredMime(input.contentType);
  const allowedMimes = INBOX_REPLY_ATTACHMENT_MIME_BY_EXT[ext];
  if (declared && !allowedMimes.includes(declared)) {
    return {
      ok: false,
      code: "mime_blocked",
      message: "Dateityp (MIME) ist nicht erlaubt.",
    };
  }

  const isOoxml = ext === "docx" || ext === "xlsx";
  if (
    looksLikeActiveReplyAttachmentContent(input.content, {
      allowXmlDeclaration: isOoxml,
    })
  ) {
    return {
      ok: false,
      code: "content_sniff_blocked",
      message: "Dateiinhalt wurde aus Sicherheitsgründen abgelehnt.",
    };
  }

  if (!magicMatches(input.content, ext)) {
    return {
      ok: false,
      code: "magic_mismatch",
      message: "Dateiinhalt stimmt nicht mit der Dateiendung überein.",
    };
  }

  if (isOoxml) {
    if (countZipLocalHeaders(input.content) > INBOX_REPLY_OOXML_MAX_LOCAL_HEADERS) {
      return {
        ok: false,
        code: "zip_structure_rejected",
        message: "Archivstruktur ist nicht erlaubt.",
      };
    }
    if (ext === "docx" && !isValidOoxmlStructure(input.content, "docx")) {
      return {
        ok: false,
        code: "ooxml_invalid",
        message: "DOCX-Struktur ist ungültig.",
      };
    }
    if (ext === "xlsx" && !isValidOoxmlStructure(input.content, "xlsx")) {
      return {
        ok: false,
        code: "ooxml_invalid",
        message: "XLSX-Struktur ist ungültig.",
      };
    }
  }

  return {
    ok: true,
    filename,
    extension: ext,
    contentType: declared || allowedMimes[0]!,
    sizeBytes: input.content.length,
  };
}

export function isImageReplyAttachmentExtension(
  ext: InboxReplyAttachmentExtension,
): boolean {
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}
