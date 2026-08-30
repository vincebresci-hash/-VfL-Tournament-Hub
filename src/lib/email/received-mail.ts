import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { getEmailProvider, renderEmailTemplate } from "@/lib/email/provider";
import { buildTournamentHubEmailFromTemplate } from "@/lib/email/tournament-hub-email";
import { formatDateDe } from "@/lib/format";
import type { PublicTournament } from "@/types/tournament";
import type { ActiveEmailTemplateRow } from "@/lib/supabase/database";

export type ReceivedEmailInput = {
  applicationId: string;
  contactEmail: string;
  contactFirstName: string;
  clubName: string;
  teamName: string;
  tournament: Pick<PublicTournament, "name" | "date" | "location" | "ageGroup"> | null;
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

export async function sendApplicationReceivedEmail(input: ReceivedEmailInput) {
  const to = input.contactEmail.trim();
  if (!to || !input.applicationId) {
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("active_email_template", {
    p_type: "application-received",
  });

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error("active_email_template failed", error.message);
    }
    return;
  }

  const template = ((data ?? []) as ActiveEmailTemplateRow[])[0] ?? null;
  if (!template) {
    return;
  }

  const variables = {
    contact_first_name: firstText(input.contactFirstName),
    club_name: firstText(input.clubName),
    team_name: firstText(input.teamName),
    tournament_name: firstText(input.tournament?.name),
    age_group: firstText(input.tournament?.ageGroup),
    tournament_date: input.tournament?.date ? formatDateDe(input.tournament.date) : "",
    location: firstText(input.tournament?.location),
  };
  const subject = renderEmailTemplate(template.subject, variables);
  const body = renderEmailTemplate(template.body, variables);
  const emailContent = buildTournamentHubEmailFromTemplate({
    subject,
    bodyText: body,
    variables,
  });
  const result = await getEmailProvider().send({
    to,
    subject,
    text: emailContent.text,
    html: emailContent.html,
    templateId: template.id,
  });

  const { error: logError } = await supabase.rpc("log_application_received_email", {
    p_application_id: input.applicationId,
    p_to_email: to,
    p_template_id: template.id,
    p_subject: subject,
    p_body: body,
    p_status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    p_error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen.",
    p_provider: result.provider,
    p_provider_message_id: result.providerMessageId ?? null,
  });

  if (logError && !isMissingRelationError(logError)) {
    console.error("log_application_received_email failed", logError.message);
  }
}
