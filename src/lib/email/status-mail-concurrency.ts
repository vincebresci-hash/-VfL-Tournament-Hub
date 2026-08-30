import type { EmailTemplateType } from "@/types/admin";

/** Must match `interval '10 minutes'` in status email lease migration. */
export const STATUS_EMAIL_RESERVATION_LEASE_MS = 10 * 60 * 1000;

export type StatusEmailReservationV2 = {
  decision: "send" | "skip";
  reservationId: string | null;
};

export type SimulatedReservationKey = {
  reservationId: string;
  createdAtMs: number;
  providerMessageId: string | null;
};

export type SimulatedStatusEmailStore = {
  sentLogs: Set<EmailTemplateType>;
  keys: Map<EmailTemplateType, SimulatedReservationKey>;
};

let simulatedReservationCounter = 0;

function nextReservationId() {
  simulatedReservationCounter += 1;
  return `reservation-${simulatedReservationCounter}`;
}

function templateKey(templateType: EmailTemplateType) {
  return templateType;
}

export function createSimulatedStatusEmailStore(): SimulatedStatusEmailStore {
  return {
    sentLogs: new Set(),
    keys: new Map(),
  };
}

export function simulateReserveStatusEmailSendV2(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  nowMs: number;
  leaseMs?: number;
}): StatusEmailReservationV2 {
  const leaseMs = input.leaseMs ?? STATUS_EMAIL_RESERVATION_LEASE_MS;

  if (input.store.sentLogs.has(input.templateType)) {
    return { decision: "skip", reservationId: null };
  }

  const existing = input.store.keys.get(templateKey(input.templateType));
  if (!existing) {
    const reservationId = nextReservationId();
    input.store.keys.set(templateKey(input.templateType), {
      reservationId,
      createdAtMs: input.nowMs,
      providerMessageId: null,
    });
    return { decision: "send", reservationId };
  }

  const staleThreshold = input.nowMs - leaseMs;
  const canTakeOver =
    existing.providerMessageId === null && existing.createdAtMs < staleThreshold;

  if (!canTakeOver) {
    return { decision: "skip", reservationId: null };
  }

  const reservationId = nextReservationId();
  input.store.keys.set(templateKey(input.templateType), {
    reservationId,
    createdAtMs: input.nowMs,
    providerMessageId: null,
  });
  return { decision: "send", reservationId };
}

export function simulateClaimStatusEmailSendV2(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  reservationId: string;
  providerMessageId: string;
}): boolean {
  const existing = input.store.keys.get(templateKey(input.templateType));
  if (
    !existing ||
    existing.reservationId !== input.reservationId ||
    existing.providerMessageId !== null
  ) {
    return false;
  }

  existing.providerMessageId = input.providerMessageId;
  return true;
}

export function simulateReleaseStatusEmailSendV2(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  reservationId: string;
}): void {
  if (input.store.sentLogs.has(input.templateType)) {
    return;
  }

  const existing = input.store.keys.get(templateKey(input.templateType));
  if (
    !existing ||
    existing.reservationId !== input.reservationId ||
    existing.providerMessageId !== null
  ) {
    return;
  }

  input.store.keys.delete(templateKey(input.templateType));
}

export function simulateWriteSentLog(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
}): void {
  input.store.sentLogs.add(input.templateType);
}

export function getCurrentReservationId(
  store: SimulatedStatusEmailStore,
  templateType: EmailTemplateType,
): string | null {
  return store.keys.get(templateKey(templateType))?.reservationId ?? null;
}
