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
