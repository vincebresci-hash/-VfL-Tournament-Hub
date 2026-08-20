import type { ApplicationStatus } from "@/types/application";
import type { EmailTemplateType } from "@/types/admin";

export const STATUS_EMAIL_TEMPLATE_TYPES: Partial<
  Record<ApplicationStatus, EmailTemplateType>
> = {
  accepted: "application-accepted",
  "waiting-list": "waiting-list",
  rejected: "application-rejected",
  "under-review": "application-under-review",
};

export function templateTypeForStatus(
  status: ApplicationStatus,
): EmailTemplateType | null {
  return STATUS_EMAIL_TEMPLATE_TYPES[status] ?? null;
}
