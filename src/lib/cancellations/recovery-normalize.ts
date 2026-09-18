/**
 * Guest cancellation recovery identity normalization.
 *
 * Deterministic equality only (no fuzzy / LIKE / partial matching):
 * - email → trim + lower-case (same as invitation normalizeEmail / SQL lower(btrim))
 * - club_name / team_name → trim + lower-case (SQL lower(btrim))
 */
export function normalizeRecoveryEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeRecoveryLabel(value: string) {
  return value.trim().toLowerCase();
}

export function isValidRecoveryEmail(value: string) {
  const normalized = normalizeRecoveryEmail(value);
  if (!normalized || normalized.length > 320) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isNonEmptyRecoveryLabel(value: string) {
  const normalized = normalizeRecoveryLabel(value);
  return normalized.length > 0 && normalized.length <= 200;
}
