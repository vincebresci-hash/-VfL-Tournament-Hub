import "server-only";

import { isMissingRelationError } from "@/lib/db/errors";
import { getEmailProvider, renderEmailTemplate } from "@/lib/email/provider";
import { buildTournamentHubEmailFromTemplate } from "@/lib/email/tournament-hub-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { EmailLogStatus } from "@/types/admin";

type RecoveryMailInput = {
  applicationId: string;
  toEmail: string;
  contactFirstName: string;
  tournamentName: string;
  participationUrl: string;
};

async function writeRecoveryEmailLog(entry: {
  applicationId: string;
  templateId: string | null;
  toEmail: string;
  subject: string | null;
  body: string | null;
  status: EmailLogStatus;
  error: string | null;
  provider: string | null;
  providerMessageId: string | null;
}) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("email_logs").insert({
    application_id: entry.applicationId,
    template_id: entry.templateId,
    template_type: "participation-access-recovery",
    to_email: entry.toEmail,
    subject: entry.subject,
    body: entry.body,
    status: entry.status,
    error: entry.error,
    provider: entry.provider,
    provider_message_id: entry.providerMessageId,
    created_by: null,
  });

  if (error && !isMissingRelationError(error)) {
    console.error("participation recovery email log failed", error.message);
  }
}

export async function sendParticipationAccessRecoveryEmail(
  input: RecoveryMailInput,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: templates, error: templateError } = await supabase
    .from("email_templates")
    .select("id, subject, body, type, active")
    .eq("type", "participation-access-recovery")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (templateError) {
    if (!isMissingRelationError(templateError)) {
      console.error("participation recovery template lookup failed", templateError.message);
    }
    return;
  }

  const template = templates?.[0] ?? null;
  if (!template || !template.active) {
    return;
  }

  const variables = {
    contact_first_name: input.contactFirstName || "Team",
    tournament_name: input.tournamentName,
    participation_url: input.participationUrl,
  };

  const subject = renderEmailTemplate(template.subject, variables);
  const body = renderEmailTemplate(template.body, variables);
  const emailContent = buildTournamentHubEmailFromTemplate({
    subject,
    bodyText: body,
    variables,
    cta: {
      label: "Teilnahme verwalten",
      url: input.participationUrl,
    },
  });

  const result = await getEmailProvider().send({
    to: input.toEmail,
    subject,
    text: emailContent.text,
    html: emailContent.html,
    templateId: template.id,
  });

  await writeRecoveryEmailLog({
    applicationId: input.applicationId,
    templateId: template.id,
    toEmail: input.toEmail,
    subject,
    body,
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen.",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
  });
}
