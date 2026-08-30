import type { EmailTemplateType } from "@/types/admin";

/** Must match `interval '10 minutes'` in status email lease migration. */
export const STATUS_EMAIL_RESERVATION_LEASE_MS = 10 * 60 * 1000;

export type SimulatedReservationKey = {
  createdAtMs: number;
  providerMessageId: string | null;
};

export type SimulatedStatusEmailStore = {
  sentLogs: Set<EmailTemplateType>;
  keys: Map<EmailTemplateType, SimulatedReservationKey>;
};

function key(templateType: EmailTemplateType) {
  return templateType;
}

export function createSimulatedStatusEmailStore(): SimulatedStatusEmailStore {
  return {
    sentLogs: new Set(),
    keys: new Map(),
  };
}

export function simulateReserveStatusEmailSendWithLease(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  nowMs: number;
  leaseMs?: number;
}): "send" | "skip" {
  const leaseMs = input.leaseMs ?? STATUS_EMAIL_RESERVATION_LEASE_MS;

  if (input.store.sentLogs.has(input.templateType)) {
    return "skip";
  }

  if (!input.store.keys.has(key(input.templateType))) {
    input.store.keys.set(key(input.templateType), {
      createdAtMs: input.nowMs,
      providerMessageId: null,
    });
    return "send";
  }

  const existing = input.store.keys.get(key(input.templateType))!;
  const staleThreshold = input.nowMs - leaseMs;
  const canTakeOver =
    existing.providerMessageId === null && existing.createdAtMs < staleThreshold;

  if (!canTakeOver) {
    return "skip";
  }

  input.store.keys.delete(key(input.templateType));
  input.store.keys.set(key(input.templateType), {
    createdAtMs: input.nowMs,
    providerMessageId: null,
  });
  return "send";
}

export function simulateClaimStatusEmailSend(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  providerMessageId: string;
}): boolean {
  const existing = input.store.keys.get(key(input.templateType));
  if (!existing || existing.providerMessageId !== null) {
    return false;
  }

  existing.providerMessageId = input.providerMessageId;
  return true;
}

export function simulateReleaseStatusEmailSend(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
}): void {
  if (input.store.sentLogs.has(input.templateType)) {
    return;
  }

  const existing = input.store.keys.get(key(input.templateType));
  if (!existing || existing.providerMessageId !== null) {
    return;
  }

  input.store.keys.delete(key(input.templateType));
}

export function simulateWriteSentLog(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
}): void {
  input.store.sentLogs.add(input.templateType);
}

export type SimulatedSendRequest = {
  id: "A" | "B";
  reserved: boolean;
  claimed: boolean;
  sent: boolean;
};

export function simulateConcurrentStatusEmailSends(input: {
  store: SimulatedStatusEmailStore;
  templateType: EmailTemplateType;
  startMs: number;
  requestBDelayMs: number;
  requestASendCompletesMs: number;
}): { requestA: SimulatedSendRequest; requestB: SimulatedSendRequest; totalSends: number } {
  const requestA: SimulatedSendRequest = {
    id: "A",
    reserved: false,
    claimed: false,
    sent: false,
  };
  const requestB: SimulatedSendRequest = {
    id: "B",
    reserved: false,
    claimed: false,
    sent: false,
  };

  const reserveA = simulateReserveStatusEmailSendWithLease({
    store: input.store,
    templateType: input.templateType,
    nowMs: input.startMs,
  });
  requestA.reserved = reserveA === "send";

  const reserveB = simulateReserveStatusEmailSendWithLease({
    store: input.store,
    templateType: input.templateType,
    nowMs: input.startMs + input.requestBDelayMs,
  });
  requestB.reserved = reserveB === "send";

  if (requestA.reserved) {
    requestA.claimed = simulateClaimStatusEmailSend({
      store: input.store,
      templateType: input.templateType,
      providerMessageId: "resend-a",
    });
    requestA.sent = requestA.claimed;
    simulateWriteSentLog({
      store: input.store,
      templateType: input.templateType,
    });
  }

  if (requestB.reserved) {
    requestB.claimed = simulateClaimStatusEmailSend({
      store: input.store,
      templateType: input.templateType,
      providerMessageId: "resend-b",
    });
    requestB.sent = requestB.claimed;
    simulateWriteSentLog({
      store: input.store,
      templateType: input.templateType,
    });
  }

  void input.requestASendCompletesMs;

  return {
    requestA,
    requestB,
    totalSends: Number(requestA.sent) + Number(requestB.sent),
  };
}
