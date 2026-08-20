import { getEmailProvider } from "@/lib/email/provider";
import { recordEmailLog } from "@/lib/email/logs";
import {
  buildApplicationEmailVariables,
  plainTextToHtml,
  renderTemplate,
} from "@/lib/email/render";
import { resolveTemplateForStatus } from "@/lib/email/templates";
import type { ApplicationEmailOutcome } from "@/lib/email/types";
import type { ClubApplicationView } from "@/types/club";
import type { ApplicationStatus } from "@/types/application";

/**
 * Core, server-only pipeline for a single application email:
 *   1. resolve the active template for the status
 *   2. render subject + body with the whitelisted placeholders
 *   3. send via the configured provider (Resend, else Noop)
 *   4. record the attempt in email_logs
 *
 * This function never throws. Callers can safely ignore the result; the
 * surrounding business logic (application save / status change) must not be
 * affected by an email failure.
 */
async function sendApplicationEmail(
  status: ApplicationStatus,
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  try {
    const recipient = application.contactEmail?.trim();

    const template = await resolveTemplateForStatus(status);
    if (!template) {
      console.warn(
        `[email] Keine aktive Vorlage für Status "${status}" gefunden – es wird keine E-Mail versendet.`,
      );
      return { attempted: false, ok: false, skipped: true, reason: "no-template" };
    }

    if (!recipient) {
      console.warn(
        "[email] Bewerbung ohne Empfänger-Adresse – es wird keine E-Mail versendet.",
      );
      return { attempted: false, ok: false, skipped: true, reason: "no-recipient" };
    }

    const variables = buildApplicationEmailVariables(application);
    const subject = renderTemplate(template.subject, variables);
    const text = renderTemplate(template.body, variables);
    const html = plainTextToHtml(text);

    const provider = getEmailProvider();
    const result = await provider.send({
      to: recipient,
      subject,
      text,
      html,
      templateId: template.id,
    });

    const logStatus = result.ok ? "sent" : "failed";

    await recordEmailLog({
      applicationId: application.id,
      templateId: template.id,
      recipient,
      subject,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      status: logStatus,
      errorMessage: result.ok ? null : result.error ?? null,
    });

    if (!result.ok) {
      console.error(
        `[email] Versand fehlgeschlagen (Status "${status}", Provider "${result.provider}").`,
      );
    }

    return {
      attempted: true,
      ok: result.ok,
      skipped: Boolean(result.skipped),
      reason: result.ok ? undefined : result.error,
    };
  } catch (error) {
    console.error(
      "[email] Unerwarteter Fehler im E-Mail-Versand:",
      error instanceof Error ? error.message : "unbekannt",
    );
    return { attempted: true, ok: false, skipped: false, reason: "unexpected-error" };
  }
}

export function sendApplicationReceivedEmail(
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  return sendApplicationEmail("new", application);
}

export function sendApplicationUnderReviewEmail(
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  return sendApplicationEmail("under-review", application);
}

export function sendApplicationAcceptedEmail(
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  return sendApplicationEmail("accepted", application);
}

export function sendApplicationWaitingListEmail(
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  return sendApplicationEmail("waiting-list", application);
}

export function sendApplicationRejectedEmail(
  application: ClubApplicationView,
): Promise<ApplicationEmailOutcome> {
  return sendApplicationEmail("rejected", application);
}
