import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { writeCancellationEmailLogServer } from "@/lib/cancellations/cancellation-email-log";
import { cancellationOnTimeLabel } from "@/lib/cancellations/deadline";
import { publicContactEmail } from "@/lib/contact";
import { getEmailProvider, renderEmailTemplate } from "@/lib/email/provider";
import { buildTournamentHubEmailFromTemplate } from "@/lib/email/tournament-hub-email";
import { formatDateDe } from "@/lib/format";
import { getAppSettings } from "@/lib/settings";
import type { EmailTemplateType } from "@/types/admin";

type CancellationMailContext = {
  requestId: string;
  applicationId: string;
  actorId: string | null;
  externalTokenHash?: string | null;
  decision?: "confirmed" | "rejected";
  adminNote?: string;
};

type ApplicationMailRow = {
  id: string;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  club_name: string | null;
  team_name: string | null;
  tournaments?: {
    name: string;
    date: string;
    location: string | null;
  } | {
    name: string;
    date: string;
    location: string | null;
  }[] | null;
};

type RequestMailRow = {
  id: string;
  reason: string | null;
  is_late_request: boolean;
};

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function buildVariables(
  application: ApplicationMailRow,
  request: RequestMailRow,
  adminNote?: string,
) {
  const tournament = firstRelation(application.tournaments);

  return {
    contact_first_name: firstText(application.contact_first_name),
    contact_last_name: firstText(application.contact_last_name),
    club_name: firstText(application.club_name),
    team_name: firstText(application.team_name),
    tournament_name: firstText(tournament?.name),
    tournament_date: tournament?.date ? formatDateDe(tournament.date) : "",
    location: firstText(tournament?.location),
    contact_email: firstText(application.contact_email),
    cancellation_reason: firstText(request.reason, "Keine Angabe"),
    cancellation_on_time_label: cancellationOnTimeLabel(request.is_late_request),
    cancellation_admin_note: firstText(adminNote, "Keine zusätzliche Begründung."),
  };
}

async function reserveCancellationEmail(
  requestId: string,
  templateType: EmailTemplateType,
  externalTokenHash?: string | null,
): Promise<"send" | "skip" | "error"> {
  const supabase = await createClient();

  if (externalTokenHash) {
    const { data, error } = await supabase.rpc(
      "reserve_external_cancellation_email_send",
      {
        p_token_hash: externalTokenHash,
        p_cancellation_request_id: requestId,
        p_template_type: templateType,
      },
    );

    if (error) {
      if (isMissingRelationError(error)) {
        return "error";
      }

      console.error(
        "reserve_external_cancellation_email_send failed",
        error.message,
      );
      return "error";
    }

    return data === "send" ? "send" : "skip";
  }

  const { data, error } = await supabase.rpc("reserve_cancellation_email_send", {
    p_cancellation_request_id: requestId,
    p_template_type: templateType,
  });

  if (error) {
    if (isMissingRelationError(error)) {
      return "error";
    }

    console.error("reserve_cancellation_email_send failed", error.message);
    return "error";
  }

  return data === "send" ? "send" : "skip";
}

async function sendTemplateEmail(input: {
  requestId: string;
  applicationId: string;
  templateType: EmailTemplateType;
  toEmail: string;
  variables: Record<string, string>;
  actorId: string | null;
  externalTokenHash?: string | null;
}) {
  const reservation = await reserveCancellationEmail(
    input.requestId,
    input.templateType,
    input.externalTokenHash,
  );
  if (reservation !== "send") {
    return;
  }

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("email_templates")
    .select("id, subject, body, type, active")
    .eq("type", input.templateType)
    .order("updated_at", { ascending: false })
    .limit(1);

  const template = templates?.[0] ?? null;
  if (!template || !template.active) {
    return;
  }

  const subject = renderEmailTemplate(template.subject, input.variables);
  const body = renderEmailTemplate(template.body, input.variables);
  const emailContent = buildTournamentHubEmailFromTemplate({
    subject,
    bodyText: body,
    variables: input.variables,
  });
  const result = await getEmailProvider().send({
    to: input.toEmail,
    subject,
    text: emailContent.text,
    html: emailContent.html,
    templateId: template.id,
  });

  await writeCancellationEmailLogServer({
    requestId: input.requestId,
    applicationId: input.applicationId,
    templateId: template.id,
    templateType: input.templateType,
    toEmail: input.toEmail,
    subject,
    body,
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen.",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    actorUserId: input.actorId,
  });
}

export async function sendCancellationWorkflowEmails(
  input: CancellationMailContext,
) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("cancellation_requests")
    .select("id, reason, is_late_request")
    .eq("id", input.requestId)
    .maybeSingle();

  const { data: application } = await supabase
    .from("applications")
    .select(
      "id, contact_email, contact_first_name, contact_last_name, club_name, team_name, tournaments (name, date, location)",
    )
    .eq("id", input.applicationId)
    .maybeSingle();

  if (!request || !application) {
    return;
  }

  const variables = buildVariables(
    application as ApplicationMailRow,
    request as RequestMailRow,
    input.adminNote,
  );
  const teamEmail = firstText(application.contact_email);

  if (input.decision === "confirmed") {
    if (teamEmail) {
      await sendTemplateEmail({
        requestId: input.requestId,
        applicationId: input.applicationId,
        templateType: "cancellation-confirmed",
        toEmail: teamEmail,
        variables,
        actorId: input.actorId,
        externalTokenHash: input.externalTokenHash,
      });
    }
    return;
  }

  if (input.decision === "rejected") {
    if (teamEmail) {
      await sendTemplateEmail({
        requestId: input.requestId,
        applicationId: input.applicationId,
        templateType: "cancellation-rejected",
        toEmail: teamEmail,
        variables,
        actorId: input.actorId,
        externalTokenHash: input.externalTokenHash,
      });
    }
    return;
  }

  const settings = await getAppSettings();
  const adminEmail = publicContactEmail(settings);

  await sendTemplateEmail({
    requestId: input.requestId,
    applicationId: input.applicationId,
    templateType: "cancellation-request-received",
    toEmail: adminEmail,
    variables,
    actorId: input.actorId,
    externalTokenHash: input.externalTokenHash,
  });

  if (teamEmail) {
    await sendTemplateEmail({
      requestId: input.requestId,
      applicationId: input.applicationId,
      templateType: "cancellation-request-submitted",
      toEmail: teamEmail,
      variables,
      actorId: input.actorId,
      externalTokenHash: input.externalTokenHash,
    });
  }
}
