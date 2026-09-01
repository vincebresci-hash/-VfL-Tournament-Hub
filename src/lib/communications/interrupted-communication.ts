import { communicationStatusLabel } from "@/lib/communications/labels";

export const INTERRUPTED_COMMUNICATION_STALE_MS = 30 * 60 * 1000;

export type CommunicationAdminStatusInput = {
  status: string;
  createdAt: string;
  sentCount: number;
  failedCount: number;
  now?: Date;
};

export function isInterruptedCommunication(
  input: CommunicationAdminStatusInput,
): boolean {
  if (input.status !== "sending") {
    return false;
  }

  if (input.sentCount !== 0 || input.failedCount !== 0) {
    return false;
  }

  const createdAtMs = new Date(input.createdAt).getTime();
  const nowMs = input.now?.getTime() ?? Date.now();

  return nowMs - createdAtMs > INTERRUPTED_COMMUNICATION_STALE_MS;
}

export function communicationAdminStatusLabel(
  input: CommunicationAdminStatusInput,
): string {
  if (isInterruptedCommunication(input)) {
    return "Unterbrochen";
  }

  return communicationStatusLabel(input.status);
}

export function communicationAdminStatusHint(
  input: CommunicationAdminStatusInput,
): string | null {
  if (isInterruptedCommunication(input)) {
    return "Versand wurde nicht abgeschlossen.";
  }

  return null;
}

export const INTERRUPTED_COMMUNICATION_DETAIL_WARNING =
  "Dieser Versand wurde unterbrochen und nicht abgeschlossen.";

/**
 * Controlled exceptions in sendTournamentCommunication() can reach finalize via
 * try/finally. Abrupt serverless termination (timeout, OOM, platform kill) may
 * still skip finally and leave status = sending without provider evidence.
 */
export const SEND_FINALIZE_SERVERLESS_LIMITATION =
  "Hard serverless termination cannot always execute finally.";
