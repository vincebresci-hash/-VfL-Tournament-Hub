export const HELP_CHAT_MAX_INPUT_LENGTH = 500;

export function sanitizeHelpChatInput(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const withoutTags = value
    .replace(/<[^>]*>/g, " ")
    .replace(/javascript:/gi, " ")
    .replace(/data:/gi, " ");

  const normalized = withoutTags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > HELP_CHAT_MAX_INPUT_LENGTH) {
    return null;
  }

  return normalized;
}
