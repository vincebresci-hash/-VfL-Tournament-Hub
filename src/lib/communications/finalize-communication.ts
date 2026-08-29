export type RecipientSendStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export type FinalizeCommunicationResult = {
  status: "sending" | "sent" | "partially_sent" | "failed";
  sentCount: number;
  failedCount: number;
  complete: boolean;
};

export function resolveFinalizeCommunicationStatus(
  recipients: RecipientSendStatus[],
): FinalizeCommunicationResult {
  const sentCount = recipients.filter((status) => status === "sent").length;
  const failedCount = recipients.filter((status) => status === "failed").length;
  const pendingCount = recipients.filter((status) => status === "pending").length;
  const sendingCount = recipients.filter((status) => status === "sending").length;
  const total = recipients.length;
  const complete = pendingCount === 0 && sendingCount === 0;

  if (total === 0) {
    return { status: "failed", sentCount, failedCount, complete: true };
  }

  if (!complete) {
    return { status: "sending", sentCount, failedCount, complete: false };
  }

  if (sentCount === total) {
    return { status: "sent", sentCount, failedCount, complete: true };
  }

  if (failedCount === total) {
    return { status: "failed", sentCount, failedCount, complete: true };
  }

  if (sentCount > 0 && failedCount > 0) {
    return { status: "partially_sent", sentCount, failedCount, complete: true };
  }

  if (sentCount > 0) {
    return { status: "sent", sentCount, failedCount, complete: true };
  }

  return { status: "failed", sentCount, failedCount, complete: true };
}
