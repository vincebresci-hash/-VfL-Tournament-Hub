import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { getEmailProvider, renderEmailTemplate } from "@/lib/email/provider";
import { buildTournamentHubEmailFromTemplate } from "@/lib/email/tournament-hub-email";
import { formatDateDe } from "@/lib/format";
import {
  buildCommunicationVariables,
  stripUnresolvedPlaceholders,
} from "@/lib/communications/variables";
import {
  buildCommunicationReceiptEmailAppendix,
  buildCommunicationReceiptUrl,
  communicationReceiptTokenExpiresAt,
  createCommunicationReceiptTokenPair,
} from "@/lib/communications/communication-receipt-token";
import { evaluateCommunicationSendOutcome } from "@/lib/communications/send-outcome";
import type { PaymentStatus } from "@/types/payment";
import type { CommunicationComposeInput } from "@/types/communication";

type RecipientSendRow = {
  id: string;
  application_id: string | null;
  team_directory_entry_id: string | null;
  recipient_email: string;
  recipient_team_name: string;
  recipient_club_name: string | null;
  recipient_contact_first_name: string | null;
};

type ApplicationContextRow = {
  contact_first_name: string | null;
  team_name: string | null;
  club_name: string | null;
  payment_status: PaymentStatus | null;
  participation_fee: number | string | null;
};

async function reserveCommunicationEmailSend(recipientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_communication_email_send", {
    p_communication_recipient_id: recipientId,
  });

  if (error) {
    return { status: "error" as const, message: error.message };
  }

  return data === "send"
    ? { status: "send" as const }
    : { status: "skip" as const };
}

async function completeCommunicationRecipient(input: {
  recipientId: string;
  sendStatus: "sent" | "failed" | "skipped";
  emailLogId: string | null;
  errorMessage: string | null;
}) {
  const supabase = await createClient();
  await supabase.rpc("complete_communication_recipient", {
    p_recipient_id: input.recipientId,
    p_send_status: input.sendStatus,
    p_email_log_id: input.emailLogId,
    p_error_message: input.errorMessage,
  });
}

async function writeCommunicationEmailLog(input: {
  applicationId: string | null;
  communicationRecipientId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  provider: string;
  providerMessageId: string | null;
  createdBy: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_logs")
    .insert({
      application_id: input.applicationId,
      communication_recipient_id: input.communicationRecipientId,
      template_type: null,
      to_email: input.toEmail,
      subject: input.subject,
      body: input.body,
      status: input.status,
      error: input.error,
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    return null;
  }

  return data.id as string;
}

async function loadApplicationContext(applicationId: string | null) {
  if (!applicationId) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select(
      "contact_first_name, team_name, club_name, payment_status, participation_fee",
    )
    .eq("id", applicationId)
    .maybeSingle();

  return (data as ApplicationContextRow | null) ?? null;
}

async function loadTournamentContext(tournamentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("name, slug, mein_turnierplan_url, date")
    .eq("id", tournamentId)
    .maybeSingle();

  return data;
}

async function issueCommunicationConfirmationToken(input: {
  recipientId: string;
  tokenHash: string;
  expiresAt: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_communication_confirmation_token", {
    p_communication_recipient_id: input.recipientId,
    p_token_hash: input.tokenHash,
    p_expires_at: input.expiresAt,
  });

  if (error) {
    return "error" as const;
  }

  return data === "created" || data === "replaced"
    ? (data as "created" | "replaced")
    : ("error" as const);
}

async function finalizeCommunicationSafe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communicationId: string,
) {
  const { error } = await supabase.rpc("finalize_communication", {
    p_communication_id: communicationId,
  });

  if (error) {
    console.error("[communications.send] finalize_communication failed", {
      code: error.code ?? "unknown",
      message: error.message ?? "unknown",
    });
  }
}

export async function sendTournamentCommunication(input: {
  compose: CommunicationComposeInput;
  actorId: string | null;
}): Promise<{
  communicationId: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  error: string | null;
  notice: string | null;
}> {
  const supabase = await createClient();
  const { compose, actorId } = input;

  const { data: communicationId, error: initiateError } = await supabase.rpc(
    "initiate_communication_send",
    {
      p_tournament_id: compose.tournamentId,
      p_type: compose.type,
      p_subject: compose.subject,
      p_body: compose.body,
      p_important: compose.important,
      p_recipient_filter: compose.recipientFilter,
      p_application_ids:
        compose.applicationIds && compose.applicationIds.length > 0
          ? compose.applicationIds
          : null,
      p_idempotency_key: compose.idempotencyKey,
      p_require_confirmation: compose.requireConfirmation,
      p_recipient_source: compose.recipientSource,
      p_team_directory_entry_ids:
        compose.teamDirectoryEntryIds && compose.teamDirectoryEntryIds.length > 0
          ? compose.teamDirectoryEntryIds
          : null,
    },
  );

  if (initiateError || !communicationId) {
    const message = initiateError?.message ?? "";
    if (message.includes("no eligible recipients")) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        error: "Keine berechtigten Empfänger gefunden.",
        notice: null,
      };
    }

    if (
      message.includes("payment reminder only allows payment-pending or custom filter") ||
      message.includes("payment reminder cannot target waitlist") ||
      message.includes("payment reminder not allowed for team-directory source")
    ) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        error:
          compose.recipientSource === "team-directory"
            ? "Zahlungserinnerungen sind für die Team-Datenbank nicht verfügbar."
            : "Zahlungserinnerungen sind nur für ausstehende Zahlungen (payment-pending) oder eine individuelle Auswahl erlaubt.",
        notice: null,
      };
    }

    if (isMissingRelationError(initiateError)) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        error: "Kommunikationsmodul ist noch nicht migriert.",
        notice: null,
      };
    }

    return {
      communicationId: null,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      error: "Die Kommunikation konnte nicht gestartet werden.",
      notice: null,
    };
  }

  const tournament = await loadTournamentContext(compose.tournamentId);

  const { data: communicationRow } = await supabase
    .from("tournament_communications")
    .select("status, sent_count, failed_count, recipient_count")
    .eq("id", communicationId)
    .maybeSingle();

  if (communicationRow && communicationRow.status !== "sending") {
    const sentCount = communicationRow.sent_count ?? 0;
    const failedCount = communicationRow.failed_count ?? 0;
    const skippedCount = Math.max(
      0,
      (communicationRow.recipient_count ?? 0) - sentCount - failedCount,
    );
    const outcome = evaluateCommunicationSendOutcome({
      sentCount,
      failedCount,
      skippedCount,
    });

    return {
      communicationId,
      sentCount,
      failedCount,
      skippedCount,
      error: outcome.error,
      notice: outcome.notice,
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  try {
    const { data: recipients, error: recipientsError } = await supabase.rpc(
      "list_pending_communication_recipients",
      {
        p_communication_id: communicationId,
      },
    );

    if (recipientsError || !recipients || recipients.length === 0) {
      return {
        communicationId,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        error: "Empfänger konnten nicht geladen werden.",
        notice: null,
      };
    }

    const provider = getEmailProvider();
    const tokenExpiresAt = communicationReceiptTokenExpiresAt(
      tournament?.date ?? null,
    );

    for (const recipient of recipients as RecipientSendRow[]) {
      const reservation = await reserveCommunicationEmailSend(recipient.id);
      if (reservation.status === "skip") {
        skippedCount += 1;
        continue;
      }

      if (reservation.status === "error") {
        await completeCommunicationRecipient({
          recipientId: recipient.id,
          sendStatus: "failed",
          emailLogId: null,
          errorMessage: "Versandreservierung fehlgeschlagen.",
        });
        failedCount += 1;
        continue;
      }

      const application = recipient.application_id
        ? await loadApplicationContext(recipient.application_id)
        : null;
      const participationFee =
        application?.participation_fee != null
          ? Number(application.participation_fee)
          : null;

      let confirmationUrl = "";
      if (compose.requireConfirmation) {
        const tokenPair = createCommunicationReceiptTokenPair();
        const issueResult = await issueCommunicationConfirmationToken({
          recipientId: recipient.id,
          tokenHash: tokenPair.tokenHash,
          expiresAt: tokenExpiresAt,
        });

        if (issueResult === "created" || issueResult === "replaced") {
          confirmationUrl = buildCommunicationReceiptUrl(tokenPair.token);
        } else {
          await completeCommunicationRecipient({
            recipientId: recipient.id,
            sendStatus: "failed",
            emailLogId: null,
            errorMessage: "Bestätigungstoken konnte nicht erstellt werden.",
          });
          failedCount += 1;
          continue;
        }
      }

      const variables = buildCommunicationVariables({
        contactFirstName:
          application?.contact_first_name ??
          recipient.recipient_contact_first_name ??
          "",
        teamName: recipient.recipient_team_name,
        clubName: recipient.recipient_club_name ?? application?.club_name ?? "",
        tournamentName: tournament?.name ?? "",
        tournamentSlug: tournament?.slug ?? "",
        meinTurnierplanUrl: tournament?.mein_turnierplan_url ?? null,
        participationFee: Number.isFinite(participationFee) ? participationFee : null,
        paymentStatus: application?.payment_status ?? null,
        confirmationUrl,
      });

      const renderedSubject = stripUnresolvedPlaceholders(
        renderEmailTemplate(compose.subject, variables),
      );
      let renderedBody = stripUnresolvedPlaceholders(
        renderEmailTemplate(compose.body, variables),
      );

      if (compose.requireConfirmation && confirmationUrl) {
        renderedBody += buildCommunicationReceiptEmailAppendix(confirmationUrl);
      }

      const emailContent = buildTournamentHubEmailFromTemplate({
        subject: renderedSubject,
        bodyText: renderedBody,
        variables,
        tournament: {
          name: tournament?.name ?? variables.tournament_name,
          date: tournament?.date ? formatDateDe(tournament.date) : variables.tournament_date,
        },
      });

      const sendResult = await provider.send({
        to: recipient.recipient_email,
        subject: renderedSubject,
        text: emailContent.text,
        html: emailContent.html,
      });

      const logStatus = sendResult.ok ? "sent" : "failed";
      const emailLogId = await writeCommunicationEmailLog({
        applicationId: recipient.application_id,
        communicationRecipientId: recipient.id,
        toEmail: recipient.recipient_email,
        subject: renderedSubject,
        body: renderedBody,
        status: logStatus,
        error: sendResult.ok ? null : (sendResult.error ?? null),
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId ?? null,
        createdBy: actorId,
      });

      await completeCommunicationRecipient({
        recipientId: recipient.id,
        sendStatus: logStatus,
        emailLogId,
        errorMessage: sendResult.ok ? null : (sendResult.error ?? null),
      });

      if (sendResult.ok) {
        sentCount += 1;
      } else {
        failedCount += 1;
      }
    }

    const outcome = evaluateCommunicationSendOutcome({
      sentCount,
      failedCount,
      skippedCount,
    });

    return {
      communicationId,
      sentCount,
      failedCount,
      skippedCount,
      error: outcome.error,
      notice: outcome.notice,
    };
  } catch (error) {
    console.error("[communications.send] unexpected error", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return {
      communicationId,
      sentCount,
      failedCount,
      skippedCount,
      error: "Der Versand wurde unerwartet unterbrochen.",
      notice: null,
    };
  } finally {
    // Controlled paths always finalize. Abrupt serverless termination may skip this.
    await finalizeCommunicationSafe(supabase, communicationId);
  }
}
