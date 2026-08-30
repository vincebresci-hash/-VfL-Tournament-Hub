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
import type { PaymentStatus } from "@/types/payment";
import type { CommunicationComposeInput } from "@/types/communication";

type RecipientSendRow = {
  id: string;
  application_id: string | null;
  recipient_email: string;
  recipient_team_name: string;
  recipient_club_name: string | null;
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
    return "skip" as const;
  }

  return data === "send" ? ("send" as const) : ("skip" as const);
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

export async function sendTournamentCommunication(input: {
  compose: CommunicationComposeInput;
  actorId: string | null;
}): Promise<{
  communicationId: string | null;
  sentCount: number;
  failedCount: number;
  error: string | null;
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
    },
  );

  if (initiateError || !communicationId) {
    const message = initiateError?.message ?? "";
    if (message.includes("no eligible recipients")) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        error: "Keine berechtigten Empfänger gefunden.",
      };
    }

    if (
      message.includes("payment reminder only allows payment-pending or custom filter") ||
      message.includes("payment reminder cannot target waitlist")
    ) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        error:
          "Zahlungserinnerungen sind nur für ausstehende Zahlungen (payment-pending) oder eine individuelle Auswahl erlaubt.",
      };
    }

    if (isMissingRelationError(initiateError)) {
      return {
        communicationId: null,
        sentCount: 0,
        failedCount: 0,
        error: "Kommunikationsmodul ist noch nicht migriert.",
      };
    }

    return {
      communicationId: null,
      sentCount: 0,
      failedCount: 0,
      error: "Die Kommunikation konnte nicht gestartet werden.",
    };
  }

  const tournament = await loadTournamentContext(compose.tournamentId);

  const { data: communicationRow } = await supabase
    .from("tournament_communications")
    .select("status, sent_count, failed_count")
    .eq("id", communicationId)
    .maybeSingle();

  if (communicationRow && communicationRow.status !== "sending") {
    return {
      communicationId,
      sentCount: communicationRow.sent_count,
      failedCount: communicationRow.failed_count,
      error: null,
    };
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("communication_recipients")
    .select(
      "id, application_id, recipient_email, recipient_team_name, recipient_club_name",
    )
    .eq("communication_id", communicationId)
    .eq("send_status", "pending");

  if (recipientsError || !recipients) {
    await supabase.rpc("finalize_communication", {
      p_communication_id: communicationId,
    });

    return {
      communicationId,
      sentCount: 0,
      failedCount: 0,
      error: "Empfänger konnten nicht geladen werden.",
    };
  }

  const provider = getEmailProvider();
  let sentCount = 0;
  let failedCount = 0;
  const tokenExpiresAt = communicationReceiptTokenExpiresAt(
    tournament?.date ?? null,
  );

  for (const recipient of recipients as RecipientSendRow[]) {
    const reservation = await reserveCommunicationEmailSend(recipient.id);
    if (reservation === "skip") {
      continue;
    }

    const application = await loadApplicationContext(recipient.application_id);
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
      contactFirstName: application?.contact_first_name ?? "",
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

  await supabase.rpc("finalize_communication", {
    p_communication_id: communicationId,
  });

  return {
    communicationId,
    sentCount,
    failedCount,
    error: null,
  };
}
