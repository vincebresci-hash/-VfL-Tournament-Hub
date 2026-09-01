export function evaluateCommunicationSendOutcome(input: {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}) {
  const { sentCount, failedCount, skippedCount } = input;

  if (sentCount === 0 && failedCount === 0 && skippedCount > 0) {
    return {
      error: null,
      notice: "Diese Kommunikation wurde bereits verarbeitet.",
    };
  }

  if (sentCount === 0 && failedCount === 0) {
    return {
      error:
        "Versand konnte nicht abgeschlossen werden. Es wurde keine E-Mail versendet.",
      notice: null,
    };
  }

  if (sentCount === 0 && failedCount > 0) {
    return {
      error: "Es wurde keine E-Mail versendet. Alle Empfänger sind fehlgeschlagen.",
      notice: null,
    };
  }

  if (failedCount > 0) {
    return {
      error: null,
      notice: `${sentCount} E-Mail${sentCount === 1 ? "" : "s"} gesendet, ${failedCount} fehlgeschlagen.`,
    };
  }

  if (sentCount === 1) {
    return {
      error: null,
      notice: "E-Mail erfolgreich gesendet.",
    };
  }

  return {
    error: null,
    notice: `${sentCount} E-Mails erfolgreich gesendet.`,
  };
}
