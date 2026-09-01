import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  communicationAdminStatusHint,
  communicationAdminStatusLabel,
  INTERRUPTED_COMMUNICATION_STALE_MS,
  isInterruptedCommunication,
  SEND_FINALIZE_SERVERLESS_LIMITATION,
} from "@/lib/communications/interrupted-communication";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readListBoard() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationListBoard.tsx"),
    "utf8",
  );
}

function readDetailView() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationDetailView.tsx"),
    "utf8",
  );
}

function readMail() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
}

function readComposeForm() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationComposeForm.tsx"),
    "utf8",
  );
}

const now = new Date("2026-09-01T12:00:00.000Z");
const staleCreatedAt = new Date(now.getTime() - INTERRUPTED_COMMUNICATION_STALE_MS - 60_000).toISOString();
const freshCreatedAt = new Date(now.getTime() - 5 * 60_000).toISOString();

export function runCommunicationInterruptedChecks() {
  const listBoard = readListBoard();
  const detailView = readDetailView();
  const mail = readMail();
  const composeForm = readComposeForm();

  assert(
    communicationAdminStatusLabel({
      status: "sending",
      createdAt: freshCreatedAt,
      sentCount: 0,
      failedCount: 0,
      now,
    }) === "Wird gesendet",
    "fresh sending communication shows Wird gesendet",
  );

  assert(
    isInterruptedCommunication({
      status: "sending",
      createdAt: staleCreatedAt,
      sentCount: 0,
      failedCount: 0,
      now,
    }),
    "stale sending 0/0 is interrupted",
  );

  assert(
    communicationAdminStatusLabel({
      status: "sending",
      createdAt: staleCreatedAt,
      sentCount: 0,
      failedCount: 0,
      now,
    }) === "Unterbrochen",
    "stale sending 0/0 shows Unterbrochen",
  );

  assert(
    communicationAdminStatusHint({
      status: "sending",
      createdAt: staleCreatedAt,
      sentCount: 0,
      failedCount: 0,
      now,
    }) === "Versand wurde nicht abgeschlossen.",
    "stale sending shows secondary hint",
  );

  assert(
    communicationAdminStatusLabel({
      status: "sent",
      createdAt: staleCreatedAt,
      sentCount: 1,
      failedCount: 0,
      now,
    }) === "Versendet",
    "sent communication unchanged",
  );

  assert(
    communicationAdminStatusLabel({
      status: "failed",
      createdAt: staleCreatedAt,
      sentCount: 0,
      failedCount: 1,
      now,
    }) === "Fehlgeschlagen",
    "failed communication unchanged",
  );

  assert(
    communicationAdminStatusLabel({
      status: "partially_sent",
      createdAt: staleCreatedAt,
      sentCount: 2,
      failedCount: 1,
      now,
    }) === "Teilweise versendet",
    "partially_sent unchanged",
  );

  assert(
    !isInterruptedCommunication({
      status: "sending",
      createdAt: staleCreatedAt,
      sentCount: 1,
      failedCount: 0,
      now,
    }),
    "sending with sent evidence is not interrupted display",
  );

  assert(
    listBoard.includes("communicationAdminStatusLabel") &&
      listBoard.includes("communicationAdminStatusHint"),
    "list board uses admin status helpers",
  );

  assert(
    detailView.includes("INTERRUPTED_COMMUNICATION_DETAIL_WARNING") &&
      detailView.includes("isInterruptedCommunication"),
    "detail view shows interrupted warning",
  );

  assert(
    !detailView.includes("erneut gesendet") ||
      detailView.includes("interrupted ? null : incompleteRecipients"),
    "detail view suppresses retry-style incomplete copy when interrupted",
  );

  assert(
    !composeForm.includes("retry") &&
      !composeForm.includes("Erneut senden") &&
      !detailView.includes("Erneut senden"),
    "no automatic retry UI for stale communications",
  );

  assert(
    mail.includes("try {") &&
      mail.includes("} catch (error)") &&
      mail.includes("} finally {") &&
      mail.includes("finalizeCommunicationSafe"),
    "send path uses try/catch/finally finalize",
  );

  assert(
    mail.includes("Hard serverless termination cannot always execute finally") ||
      mail.includes(SEND_FINALIZE_SERVERLESS_LIMITATION) ||
      readFileSync(
        join(process.cwd(), "src/lib/communications/interrupted-communication.ts"),
        "utf8",
      ).includes(SEND_FINALIZE_SERVERLESS_LIMITATION),
    "serverless finalize limitation documented",
  );

  assert(
    mail.includes('sendStatus: logStatus') && mail.includes("sendResult.ok"),
    "recipient sent only after provider result",
  );

  assert(
    !mail.includes("retry") && !mail.includes("resend"),
    "send path has no stale auto-resend",
  );

  return "ok";
}
