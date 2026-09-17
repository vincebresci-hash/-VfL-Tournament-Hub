/**
 * Normalize PostgREST/supabase-js RPC results for PostgreSQL `RETURNS uuid[]`.
 *
 * Expected happy path (PostgREST scalar array): string[] of UUID strings.
 * Also accepts narrowly:
 * - PostgreSQL array literals: "{uuid,uuid}"
 * - Stale-schema wrappers: { fn: ... } or [{ fn: ... }]
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BatchUuidParseResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: "null" | "malformed" | "count-mismatch" };

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Parse PostgreSQL text output for uuid[] only (no nested arrays, no non-UUID tokens). */
export function parsePostgresUuidArrayLiteral(value: string): string[] | null {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed[0] !== "{" || trimmed[trimmed.length - 1] !== "}") {
    return null;
  }

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  // Reject nested / multi-dimensional array literals.
  if (inner.includes("{") || inner.includes("}")) {
    return null;
  }

  const parts = inner.split(",").map((part) => {
    const token = part.trim();
    // Optional double quotes around elements.
    if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1);
    }
    return token;
  });

  if (!parts.every(isUuidString)) {
    return null;
  }

  return parts;
}

function unwrapSingleValueRecord(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const values = Object.values(value as Record<string, unknown>);
  if (values.length !== 1) {
    return value;
  }

  return values[0];
}

/**
 * Extract a UUID string array from an RPC `data` value, or null if malformed.
 * Does not enforce expected length — callers must.
 */
export function normalizeRpcUuidArray(data: unknown): string[] | null {
  if (data == null) {
    return null;
  }

  // Stale PostgREST row wrapper: [{ "create_*_applications": <payload> }]
  if (Array.isArray(data) && data.length === 1 && !isUuidString(data[0])) {
    const unwrapped = unwrapSingleValueRecord(data[0]);
    if (unwrapped !== data[0]) {
      return normalizeRpcUuidArray(unwrapped);
    }
  }

  if (Array.isArray(data)) {
    if (data.every(isUuidString)) {
      return data;
    }
    return null;
  }

  if (typeof data === "string") {
    return parsePostgresUuidArrayLiteral(data);
  }

  // Stale scalar wrapper: { "create_*_applications": <payload> }
  if (typeof data === "object") {
    const unwrapped = unwrapSingleValueRecord(data);
    if (unwrapped !== data) {
      return normalizeRpcUuidArray(unwrapped);
    }
  }

  return null;
}

/** Require exactly `expectedCount` valid UUID strings from an RPC uuid[] result. */
export function parseBatchApplicationIds(
  data: unknown,
  expectedCount: number,
): BatchUuidParseResult {
  if (data == null) {
    return { ok: false, reason: "null" };
  }

  const ids = normalizeRpcUuidArray(data);
  if (!ids) {
    return { ok: false, reason: "malformed" };
  }

  if (ids.length !== expectedCount) {
    return { ok: false, reason: "count-mismatch" };
  }

  return { ok: true, ids };
}

/** Safe metadata for server logs — no emails, phones, payload, or UUID values. */
export function describeRpcUuidArrayShape(data: unknown): {
  dataKind: string;
  arrayLength: number | null;
} {
  if (data === null) {
    return { dataKind: "null", arrayLength: null };
  }
  if (data === undefined) {
    return { dataKind: "undefined", arrayLength: null };
  }
  if (Array.isArray(data)) {
    return { dataKind: "array", arrayLength: data.length };
  }
  if (typeof data === "string") {
    return { dataKind: "string", arrayLength: null };
  }
  if (typeof data === "object") {
    return { dataKind: "object", arrayLength: null };
  }
  return { dataKind: typeof data, arrayLength: null };
}
