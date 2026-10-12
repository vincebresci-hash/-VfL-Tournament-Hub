import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

/**
 * Sanitize untrusted HTML for admin display.
 * Blocks scripts, event handlers, and remote resources (images/styles/fonts).
 */
export function sanitizeInboxHtml(input: string | null | undefined): string | null {
  if (!input?.trim()) {
    return null;
  }

  const sanitized = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
    exclusiveFilter(frame) {
      if (frame.tag === "img" || frame.tag === "picture" || frame.tag === "source") {
        return true;
      }
      if (frame.tag === "link" || frame.tag === "style" || frame.tag === "script") {
        return true;
      }
      if (frame.tag === "iframe" || frame.tag === "object" || frame.tag === "embed") {
        return true;
      }
      return false;
    },
  });

  // Defense: strip leftover remote url() / src patterns if any slipped through.
  return sanitized
    .replace(/\s(?:src|srcset)=["'][^"']*["']/gi, "")
    .replace(/url\s*\(\s*["']?https?:[^)]+\)/gi, "url(about:blank)");
}

export function buildInboxSnippet(text: string | null | undefined, maxLength = 200): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Inbox-only CSP embedded in sandboxed srcdoc rendering.
 * Does not change global site headers or outbound email templates.
 */
export const INBOX_HTML_CSP =
  "default-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'";

/** Wrap sanitized HTML for sandboxed iframe srcdoc rendering. */
export function wrapInboxHtmlForSandbox(sanitizedHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${INBOX_HTML_CSP}" /><style>body{margin:0;padding:0;font:14px/1.5 system-ui,sans-serif;color:#111;word-wrap:break-word;}a{color:#0b3d5c;}</style></head><body>${sanitizedHtml}</body></html>`;
}
