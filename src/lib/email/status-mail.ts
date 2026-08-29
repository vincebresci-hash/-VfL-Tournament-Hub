import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { applicationStatusLabel } from "@/lib/admin";
import {
  emailTextToHtml,
  getEmailProvider,
  renderEmailTemplate,
} from "@/lib/email/provider";
import {
  parseStatusEmailReservation,
  resolveStatusEmailSendDecision,
  shouldReleaseStatusEmailReservation,
  STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR,
} from "@/lib/email/status-mail-idempotency";
import { ensureParticipationCancellationToken } from "@/lib/cancellations/participation-token";
import { templateTypeForStatus } from "@/lib/email/templates";
import { formatCurrencyEur } from "@/lib/payments/format";
import { paymentStatusLabel } from "@/lib/payments/labels";
import { toApplicationPayment } from "@/lib/payments/mappers";
import { formatDateDe } from "@/lib/format";
import type { ApplicationStatus } from "@/types/application";
import type { EmailLogStatus, EmailTemplateType } from "@/types/admin";
import type {
  ClubRow,
  EmailTemplateRow,
  TeamRow,
  TournamentRow,
} from "@/lib/supabase/database";

type StatusMailApplication = {
  id: string;
  status: ApplicationStatus;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  club_name: string | null;
  club_city: string | null;
  team_name: string | null;
  age_group: string | null;
  participation_fee?: number | string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  clubs?: Pick<ClubRow, "name"> | Pick<ClubRow, "name">[] | null;
  teams?:
    | Pick<TeamRow, "name" | "age_group">
    | Pick<TeamRow, "name" | "age_group">[]
    | null;
  tournaments?:
    | Pick<TournamentRow, "name" | "date" | "location" | "age_group">
    | Pick<TournamentRow, "name" | "date" | "location" | "age_group">[]
    | null;
};

export type StatusEmailOutcome = {
  sent: boolean;
  skipped: boolean;
  error: string | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function applicationVariables(
  row: StatusMailApplication,
  status: ApplicationStatus,
  participationUrl = "",
): Record<string, string> {
  const club = firstRelation(row.clubs);
  const team = firstRelation(row.teams);
  const tournament = firstRelation(row.tournaments);
  const tournamentDate = tournament?.date
    ? formatDateDe(tournament.date)
    : "";
  const payment = toApplicationPayment(row);
  const participationFeeLine =
    payment.participationFee != null
      ? `Startgebühr: ${formatCurrencyEur(payment.participationFee)}`
      : "";
  const paymentBindingNotice =
    payment.participationFee != null
      ? "Die Teilnahme wird nach vollständigem Eingang der Startgebühr verbindlich. Die Zahlungsinformationen werden mit der Zusage bzw. über den Tournament Hub mitgeteilt."
      : "";

  return {
    contact_first_name: firstText(row.contact_first_name),
    contact_last_name: firstText(row.contact_last_name),
    club_name: firstText(row.club_name, club?.name),
    team_name: firstText(row.team_name, team?.name),
    tournament_name: firstText(tournament?.name),
    age_group: firstText(row.age_group, team?.age_group, tournament?.age_group),
    tournament_date: tournamentDate,
    location: firstText(tournament?.location),
    application_status: applicationStatusLabel[status],
    participation_url: participationUrl,
    participation_fee_line: participationFeeLine,
    payment_binding_notice: paymentBindingNotice,
    payment_status_label: paymentStatusLabel[payment.paymentStatus],
  };
}

async function reserveStatusEmailSend(
  applicationId: string,
  templateType: EmailTemplateType,
): Promise<"send" | "skip" | "error"> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_application_status_email_send", {
    p_application_id: applicationId,
    p_template_type: templateType,
  });

  if (error) {
    console.error(
      "reserve_application_status_email_send failed",
      error.message,
      error.code ?? "",
    );
    return "error";
  }

  const reservation = parseStatusEmailReservation(
    typeof data === "string" ? data : null,
  );
  if (!reservation) {
    console.error(
      "reserve_application_status_email_send returned unexpected value",
      data,
    );
    return "error";
  }

  return reservation;
}

async function releaseStatusEmailSend(
  applicationId: string,
  templateType: EmailTemplateType,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_application_status_email_send", {
    p_application_id: applicationId,
    p_template_type: templateType,
  });

  if (error) {
    console.error(
      "release_application_status_email_send failed",
      error.message,
      error.code ?? "",
    );
  }
}

async function writeEmailLog(entry: {
  applicationId: string;
  templateId: string | null;
  templateType: EmailTemplateType | null;
  toEmail: string;
  subject: string | null;
  body: string | null;
  status: EmailLogStatus;
  error: string | null;
  provider: string | null;
  providerMessageId: string | null;
  createdBy: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_logs").insert({
    application_id: entry.applicationId,
    template_id: entry.templateId,
    template_type: entry.templateType,
    to_email: entry.toEmail,
    subject: entry.subject,
    body: entry.body,
    status: entry.status,
    error: entry.error,
    provider: entry.provider,
    provider_message_id: entry.providerMessageId,
    created_by: entry.createdBy,
  });

  if (error && !isMissingRelationError(error)) {
    console.error("email_logs insert failed", error.message);
  }
}

export async function sendApplicationStatusEmail(input: {
  applicationId: string;
  status: ApplicationStatus;
  actorId: string | null;
}): Promise<StatusEmailOutcome> {
  const templateType = templateTypeForStatus(input.status);
  if (!templateType) {
    return { sent: false, skipped: true, error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, status, contact_email, contact_first_name, contact_last_name, club_name, club_city, team_name, age_group, payment_status, participation_fee, paid_at, clubs (name), teams (name, age_group), tournaments (name, date, location, age_group)",
    )
    .eq("id", input.applicationId)
    .maybeSingle();

  if (error || !data) {
    return {
      sent: false,
      skipped: false,
      error: "Die Bewerbung konnte für den E-Mail-Versand nicht geladen werden.",
    };
  }

  const application = data as unknown as StatusMailApplication;
  const to = firstText(application.contact_email);

  if (!to) {
    await writeEmailLog({
      applicationId: input.applicationId,
      templateId: null,
      templateType,
      toEmail: "",
      subject: null,
      body: null,
      status: "failed",
      error: "Keine contact_email vorhanden.",
      provider: null,
      providerMessageId: null,
      createdBy: input.actorId,
    });

    return {
      sent: false,
      skipped: false,
      error: "Keine contact_email vorhanden.",
    };
  }

  const { data: templates, error: templateError } = await supabase
    .from("email_templates")
    .select("id, subject, body, type, active")
    .eq("type", templateType)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (templateError && isMissingRelationError(templateError)) {
    return { sent: false, skipped: true, error: null };
  }

  const template = (templates?.[0] ?? null) as Pick<
    EmailTemplateRow,
    "id" | "subject" | "body" | "type" | "active"
  > | null;

  if (!template) {
    await writeEmailLog({
      applicationId: input.applicationId,
      templateId: null,
      templateType,
      toEmail: to,
      subject: null,
      body: null,
      status: "failed",
      error: "Keine E-Mail-Vorlage für diesen Status gefunden.",
      provider: null,
      providerMessageId: null,
      createdBy: input.actorId,
    });

    return {
      sent: false,
      skipped: false,
      error: "Keine E-Mail-Vorlage für diesen Status gefunden.",
    };
  }

  if (!template.active) {
    await writeEmailLog({
      applicationId: input.applicationId,
      templateId: template.id,
      templateType,
      toEmail: to,
      subject: template.subject,
      body: template.body,
      status: "skipped",
      error: "Vorlage ist deaktiviert.",
      provider: null,
      providerMessageId: null,
      createdBy: input.actorId,
    });

    return { sent: false, skipped: true, error: null };
  }

  const reservation = await reserveStatusEmailSend(input.applicationId, templateType);
  const decision = resolveStatusEmailSendDecision(reservation);

  if (decision.action === "fail_closed") {
    console.error(decision.error);
    return {
      sent: false,
      skipped: false,
      error: decision.error ?? STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR,
    };
  }

  if (decision.action === "skip") {
    return { sent: false, skipped: true, error: null };
  }

  let participationUrl = "";
  if (input.status === "accepted") {
    const tournament = firstRelation(application.tournaments);
    if (tournament?.date) {
      participationUrl =
        (await ensureParticipationCancellationToken({
          applicationId: input.applicationId,
          tournamentDate: tournament.date,
        })) ?? "";
    }

    if (!participationUrl) {
      await releaseStatusEmailSend(input.applicationId, templateType);
      return {
        sent: false,
        skipped: false,
        error: "Teilnahme-Link konnte nicht erstellt werden.",
      };
    }
  }

  const variables = applicationVariables(application, input.status, participationUrl);
  const subject = renderEmailTemplate(template.subject, variables);
  const body = renderEmailTemplate(template.body, variables);
  const result = await getEmailProvider().send({
    to,
    subject,
    text: body,
    html: emailTextToHtml(body),
    templateId: template.id,
  });

  const logStatus: EmailLogStatus = result.ok
    ? "sent"
    : result.skipped
      ? "skipped"
      : "failed";

  await writeEmailLog({
    applicationId: input.applicationId,
    templateId: template.id,
    templateType,
    toEmail: to,
    subject,
    body,
    status: logStatus,
    error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen.",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    createdBy: input.actorId,
  });

  if (
    shouldReleaseStatusEmailReservation({
      sendOk: result.ok,
      logStatus,
    })
  ) {
    await releaseStatusEmailSend(input.applicationId, templateType);
  }

  if (result.ok) {
    return { sent: true, skipped: false, error: null };
  }

  if (result.skipped) {
    return {
      sent: false,
      skipped: false,
      error: result.error ?? "E-Mail-Versand fehlgeschlagen.",
    };
  }

  return {
    sent: false,
    skipped: false,
    error: result.error ?? "E-Mail-Versand fehlgeschlagen.",
  };
}
