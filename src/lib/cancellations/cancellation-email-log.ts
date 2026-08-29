import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isMissingRelationError } from "@/lib/db/errors";
import type { EmailLogStatus, EmailTemplateType } from "@/types/admin";

const CANCELLATION_TEMPLATE_TYPES = new Set<EmailTemplateType>([
  "cancellation-request-received",
  "cancellation-request-submitted",
  "cancellation-confirmed",
  "cancellation-rejected",
]);

export async function writeCancellationEmailLogServer(entry: {
  requestId: string;
  applicationId: string;
  templateId: string | null;
  templateType: EmailTemplateType;
  toEmail: string;
  subject: string | null;
  body: string | null;
  status: EmailLogStatus;
  error: string | null;
  provider: string | null;
  providerMessageId: string | null;
  actorUserId: string | null;
}) {
  if (!CANCELLATION_TEMPLATE_TYPES.has(entry.templateType)) {
    return;
  }

  const supabase = createServiceRoleClient();

  const { data: request, error: requestError } = await supabase
    .from("cancellation_requests")
    .select("application_id")
    .eq("id", entry.requestId)
    .maybeSingle();

  if (requestError || !request || request.application_id !== entry.applicationId) {
    if (requestError && !isMissingRelationError(requestError)) {
      console.error("cancellation request lookup failed", requestError.message);
    }
    return;
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("cancellation_email_send_keys")
    .select("cancellation_request_id")
    .eq("cancellation_request_id", entry.requestId)
    .eq("template_type", entry.templateType)
    .maybeSingle();

  if (reservationError || !reservation) {
    if (reservationError && !isMissingRelationError(reservationError)) {
      console.error("cancellation reservation lookup failed", reservationError.message);
    }
    return;
  }

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
    created_by: entry.actorUserId,
  });

  if (error && !isMissingRelationError(error)) {
    console.error("cancellation email_logs insert failed", error.message);
  }
}
