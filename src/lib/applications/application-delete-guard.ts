import type { ApplicationStatus } from "@/types/application";
import type { PaymentStatus } from "@/types/payment";

export const APPLICATION_HARD_DELETE_BLOCKED_MESSAGE =
  "Diese Bewerbung kann wegen vorhandener Turnier- oder Historiendaten nicht gelöscht werden. Bitte archiviere sie stattdessen.";

export type ApplicationHardDeleteGuardInput = {
  status: ApplicationStatus;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  matchCount: number;
  groupMemberCount: number;
  cancellationCount: number;
  secureTokenCount: number;
  reviewCount: number;
  statusEmailSendKeyCount: number;
  paymentAdminNoteCount: number;
};

export type ApplicationHardDeleteGuardResult =
  | { allowed: true }
  | { allowed: false; message: string };

export const APPLICATION_HARD_DELETE_DEPENDENCY_COUNTS_RPC =
  "get_application_hard_delete_dependency_counts" as const;

const DEPENDENCY_COUNT_KEYS = [
  "match_count",
  "group_member_count",
  "cancellation_count",
  "secure_token_count",
  "review_count",
  "status_email_send_key_count",
  "payment_admin_note_count",
] as const;

type DependencyCountKey = (typeof DEPENDENCY_COUNT_KEYS)[number];

export type ApplicationHardDeleteDependencyCounts = {
  matchCount: number;
  groupMemberCount: number;
  cancellationCount: number;
  secureTokenCount: number;
  reviewCount: number;
  statusEmailSendKeyCount: number;
  paymentAdminNoteCount: number;
};

function readNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

/**
 * Parse RPC aggregate payload. Missing/invalid fields fail closed (null).
 * Never treats absent keys as zero.
 */
export function parseApplicationHardDeleteDependencyCounts(
  payload: unknown,
): ApplicationHardDeleteDependencyCounts | null {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const row = payload as Record<string, unknown>;
  const values = {} as Record<DependencyCountKey, number>;

  for (const key of DEPENDENCY_COUNT_KEYS) {
    const parsed = readNonNegativeInt(row[key]);
    if (parsed == null) {
      return null;
    }
    values[key] = parsed;
  }

  return {
    matchCount: values.match_count,
    groupMemberCount: values.group_member_count,
    cancellationCount: values.cancellation_count,
    secureTokenCount: values.secure_token_count,
    reviewCount: values.review_count,
    statusEmailSendKeyCount: values.status_email_send_key_count,
    paymentAdminNoteCount: values.payment_admin_note_count,
  };
}

/**
 * Hard delete is only allowed for clearly non-participating, non-historical rows.
 * Never delete dependencies to force a delete — block instead and recommend archive.
 */
export function evaluateApplicationHardDeleteGuard(
  input: ApplicationHardDeleteGuardInput,
): ApplicationHardDeleteGuardResult {
  const blockedStatuses: ApplicationStatus[] = [
    "accepted",
    "waiting-list",
    "cancelled",
  ];

  if (blockedStatuses.includes(input.status)) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.matchCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.groupMemberCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.cancellationCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.secureTokenCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.reviewCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.statusEmailSendKeyCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.paymentAdminNoteCount > 0) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  if (input.paymentStatus === "paid" || input.paidAt != null) {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  // Conservatively treat waived fees as relevant payment history.
  if (input.paymentStatus === "waived") {
    return { allowed: false, message: APPLICATION_HARD_DELETE_BLOCKED_MESSAGE };
  }

  return { allowed: true };
}
