import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SECURE_TOKEN_BYTE_LENGTH = 32;

export function generateSecureAccessToken() {
  return randomBytes(SECURE_TOKEN_BYTE_LENGTH).toString("base64url");
}

export function hashSecureAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidSecureAccessTokenFormat(token: string) {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 128) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}

export function secureCompareHashes(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export function hashRateLimitIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
