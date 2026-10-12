/** Conservative allowlist — unknown extensions are rejected. */
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "ics",
]);

const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.oasis.opendocument.",
  "text/calendar",
  "application/octet-stream", // only accepted with allowlisted extension + magic/sniff pass
];

const ACTIVE_MARKERS = [
  "<svg",
  "<!doctype html",
  "<html",
  "<head",
  "<body",
  "<script",
  "<iframe",
  "<object",
  "<embed",
  "<?xml",
];

export function sanitizeInboxFilename(input: string): string {
  const base = input.split(/[/\\]/).pop() ?? "anhang";
  const cleaned = base
    .replace(/[^\w.\- ()\[\]]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return cleaned || "anhang";
}

export function inboxFilenameExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts[parts.length - 1] ?? "";
}

export function isAllowedInboxFilename(filename: string): boolean {
  const ext = inboxFilenameExtension(filename);
  return Boolean(ext) && ALLOWED_EXTENSIONS.has(ext);
}

/** @deprecated Use isAllowedInboxFilename — dangerous names are simply not allowlisted. */
export function isDangerousInboxFilename(filename: string): boolean {
  return !isAllowedInboxFilename(filename);
}

export function isAllowedInboxAttachmentMime(
  contentType: string | null | undefined,
  filename: string,
): boolean {
  if (!contentType?.trim()) {
    // Missing MIME allowed only with allowlisted extension.
    return isAllowedInboxFilename(filename);
  }
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!normalized || normalized.includes("script")) {
    return false;
  }
  if (
    normalized.startsWith("text/html") ||
    normalized.startsWith("image/svg") ||
    normalized.startsWith("application/xhtml") ||
    normalized.startsWith("text/javascript") ||
    normalized.startsWith("application/javascript")
  ) {
    return false;
  }
  return ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function stripBomAndDecodeCandidates(content: Buffer): string[] {
  const candidates: string[] = [];
  // UTF-8 (with optional BOM)
  let utf8 = content.subarray(0, 1024).toString("utf8");
  if (utf8.charCodeAt(0) === 0xfeff) {
    utf8 = utf8.slice(1);
  }
  candidates.push(utf8);

  // UTF-16 LE / BE
  if (content.length >= 2) {
    const le = content.subarray(0, Math.min(content.length, 2048)).toString("utf16le");
    candidates.push(le.charCodeAt(0) === 0xfeff ? le.slice(1) : le);
    // Swap bytes for BE approximation
    const swapped = Buffer.alloc(Math.min(content.length, 2048) & ~1);
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      swapped[i] = content[i + 1] ?? 0;
      swapped[i + 1] = content[i] ?? 0;
    }
    const be = swapped.toString("utf16le");
    candidates.push(be.charCodeAt(0) === 0xfeff ? be.slice(1) : be);
  }
  return candidates;
}

function stripHtmlComments(input: string): string {
  let previous = "";
  let current = input;
  // Iterate to handle nested/adjacent comment patterns without catastrophic backtracking.
  for (let i = 0; i < 8 && current !== previous; i += 1) {
    previous = current;
    current = current.replace(/<!--[\s\S]*?-->/g, " ");
  }
  return current;
}

function textLooksActive(raw: string): boolean {
  const normalized = stripHtmlComments(raw).replace(/\0/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ACTIVE_MARKERS.some((marker) => normalized.includes(marker));
}

/** Detect active content even when filename/MIME are misleading. */
export function looksLikeActiveInboxContent(content: Buffer | null | undefined): boolean {
  if (!content || content.length === 0) {
    return false;
  }
  // Dense null bytes in the head often indicate UTF-16 text pretending to be binary.
  const head = content.subarray(0, Math.min(content.length, 64));
  let nulls = 0;
  for (const byte of head) {
    if (byte === 0) {
      nulls += 1;
    }
  }
  if (nulls >= 8 && textLooksActive(content.toString("utf16le"))) {
    return true;
  }

  for (const decoded of stripBomAndDecodeCandidates(content)) {
    if (textLooksActive(decoded)) {
      return true;
    }
  }
  return false;
}

function magicMatchesExtension(content: Buffer, ext: string): boolean {
  if (content.length < 4) {
    return ext === "txt" || ext === "csv" || ext === "ics";
  }
  if (ext === "pdf") {
    return content.subarray(0, 5).toString("utf8") === "%PDF-";
  }
  if (ext === "png") {
    return content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47;
  }
  if (ext === "jpg" || ext === "jpeg") {
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (ext === "gif") {
    const sig = content.subarray(0, 3).toString("utf8");
    return sig === "GIF";
  }
  if (ext === "webp") {
    return (
      content.subarray(0, 4).toString("utf8") === "RIFF" &&
      content.subarray(8, 12).toString("utf8") === "WEBP"
    );
  }
  if (ext === "docx" || ext === "xlsx" || ext === "pptx" || ext === "odt" || ext === "ods") {
    return content[0] === 0x50 && content[1] === 0x4b; // ZIP container
  }
  if (ext === "doc" || ext === "xls" || ext === "ppt") {
    return content[0] === 0xd0 && content[1] === 0xcf && content[2] === 0x11;
  }
  if (ext === "txt" || ext === "csv" || ext === "ics") {
    // Reject if binary/control-heavy or active markup.
    return !looksLikeActiveInboxContent(content);
  }
  return false;
}

export function evaluateInboxAttachmentSafety(input: {
  filename: string;
  contentType: string | null | undefined;
  content?: Buffer | null;
}): { allowed: boolean; reason: string | null } {
  const filename = sanitizeInboxFilename(input.filename);
  const ext = inboxFilenameExtension(filename);

  if (!isAllowedInboxFilename(filename)) {
    return { allowed: false, reason: "extension_blocked" };
  }
  if (!isAllowedInboxAttachmentMime(input.contentType, filename)) {
    return { allowed: false, reason: "mime_blocked" };
  }
  if (looksLikeActiveInboxContent(input.content ?? null)) {
    return { allowed: false, reason: "content_sniff_blocked" };
  }
  if (input.content && input.content.length > 0 && !magicMatchesExtension(input.content, ext)) {
    return { allowed: false, reason: "magic_mismatch" };
  }
  return { allowed: true, reason: null };
}

export function isRecoverableAttachmentSkipReason(reason: string | null | undefined): boolean {
  return reason === "storage_upload_failed" || reason === "missing_content";
}

export function buildInboxAttachmentStoragePath(input: {
  mailboxId: string;
  messageId: string;
  attachmentId: string;
  filename: string;
}): string {
  const safe = sanitizeInboxFilename(input.filename);
  return `${input.mailboxId}/${input.messageId}/${input.attachmentId}/${safe}`;
}

export const INBOX_ALLOWED_ATTACHMENT_EXTENSIONS = [...ALLOWED_EXTENSIONS];
