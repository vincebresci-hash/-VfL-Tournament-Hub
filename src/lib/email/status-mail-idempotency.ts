import type { EmailTemplateType } from "@/types/admin";

export type StatusEmailReservation = "send" | "skip";

export type StatusEmailReservationOutcome = StatusEmailReservation | "error";

export const STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR =
  "Status-E-Mail-Versand blockiert: Idempotenz-Migration oder RPC nicht verfügbar.";

export const STATUS_EMAIL_TEMPLATE_TYPES: readonly EmailTemplateType[] = [
  "application-accepted",
  "waiting-list",
  "application-rejected",
  "application-under-review",
] as const;

export function parseStatusEmailReservation(
  value: string | null | undefined,
): StatusEmailReservation | null {
  if (value === "send" || value === "skip") {
    return value;
  }

  return null;
}

export function shouldSkipStatusEmailAfterReservation(
  reservation: StatusEmailReservation,
): boolean {
  return reservation === "skip";
}

export function isStatusEmailReservationError(
  reservation: StatusEmailReservationOutcome,
): boolean {
  return reservation === "error";
}

export function resolveStatusEmailSendDecision(
  reservation: StatusEmailReservationOutcome,
): {
  action: "send" | "skip" | "fail_closed";
  error: string | null;
} {
  if (reservation === "error") {
    return {
      action: "fail_closed",
      error: STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR,
    };
  }

  if (shouldSkipStatusEmailAfterReservation(reservation)) {
    return { action: "skip", error: null };
  }

  return { action: "send", error: null };
}

export function shouldReleaseStatusEmailReservation(input: {
  sendOk: boolean;
  logStatus: "sent" | "failed" | "skipped";
}): boolean {
  return !input.sendOk || input.logStatus !== "sent";
}

export type StatusEmailScenario = {
  id: string;
  priorSentTemplates: EmailTemplateType[];
  reservationKeys: EmailTemplateType[];
  targetTemplate: EmailTemplateType;
  reserveResult: StatusEmailReservationOutcome;
  sendOk: boolean;
  logStatus: "sent" | "failed" | "skipped";
  expectedAction: "send" | "skip" | "fail_closed";
  expectedRelease: boolean;
};

export const STATUS_EMAIL_IDEMPOTENCY_SCENARIOS: StatusEmailScenario[] = [
  {
    id: "A",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "send",
    sendOk: true,
    logStatus: "sent",
    expectedAction: "send",
    expectedRelease: false,
  },
  {
    id: "B",
    priorSentTemplates: ["application-accepted"],
    reservationKeys: ["application-accepted"],
    targetTemplate: "application-under-review",
    reserveResult: "send",
    sendOk: true,
    logStatus: "sent",
    expectedAction: "send",
    expectedRelease: false,
  },
  {
    id: "C",
    priorSentTemplates: ["application-accepted", "application-under-review"],
    reservationKeys: ["application-accepted", "application-under-review"],
    targetTemplate: "application-accepted",
    reserveResult: "skip",
    sendOk: false,
    logStatus: "failed",
    expectedAction: "skip",
    expectedRelease: false,
  },
  {
    id: "E-first",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "send",
    sendOk: true,
    logStatus: "sent",
    expectedAction: "send",
    expectedRelease: false,
  },
  {
    id: "E-second",
    priorSentTemplates: [],
    reservationKeys: ["application-accepted"],
    targetTemplate: "application-accepted",
    reserveResult: "skip",
    sendOk: false,
    logStatus: "failed",
    expectedAction: "skip",
    expectedRelease: false,
  },
];

export function simulateReserveStatusEmailSend(input: {
  priorSentTemplates: EmailTemplateType[];
  reservationKeys: EmailTemplateType[];
  targetTemplate: EmailTemplateType;
  reserveResult: StatusEmailReservation;
}): StatusEmailReservation {
  if (input.priorSentTemplates.includes(input.targetTemplate)) {
    return "skip";
  }

  if (input.reservationKeys.includes(input.targetTemplate)) {
    return "skip";
  }

  return input.reserveResult;
}

export function simulateStatusEmailFlow(
  scenario: StatusEmailScenario,
  applicationId: string,
  otherApplicationId = "other-application-id",
): {
  action: "send" | "skip" | "fail_closed";
  release: boolean;
} {
  const reservation: StatusEmailReservationOutcome =
    scenario.reserveResult === "error"
      ? "error"
      : simulateReserveStatusEmailSend({
          priorSentTemplates: scenario.priorSentTemplates,
          reservationKeys: scenario.reservationKeys,
          targetTemplate: scenario.targetTemplate,
          reserveResult: scenario.reserveResult,
        });

  const decision = resolveStatusEmailSendDecision(reservation);
  if (decision.action !== "send") {
    void applicationId;
    void otherApplicationId;
    return { action: decision.action, release: false };
  }

  const release = shouldReleaseStatusEmailReservation({
    sendOk: scenario.sendOk,
    logStatus: scenario.logStatus,
  });

  void applicationId;
  void otherApplicationId;

  return {
    action: "send",
    release,
  };
}
