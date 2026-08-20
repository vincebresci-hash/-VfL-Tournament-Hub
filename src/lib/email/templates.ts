import { createClient } from "@/lib/supabase/server";
import type { EmailTemplateRow, EmailTemplateTypeRow } from "@/lib/supabase/database";
import type { ApplicationStatus } from "@/types/application";

type TemplateSelector = {
  type?: EmailTemplateTypeRow;
  /**
   * Fallback lookup by (case-insensitive) name fragment, used for statuses
   * without a dedicated template type (e.g. "In Prüfung").
   */
  nameIncludes?: string;
};

/**
 * Maps an application status to the template that should be sent.
 * "under-review" has no dedicated template type in the schema, so it is
 * resolved by the template name ("In Prüfung").
 */
const selectorByStatus: Record<ApplicationStatus, TemplateSelector> = {
  new: { type: "application-received" },
  "under-review": { nameIncludes: "prüfung" },
  accepted: { type: "application-accepted" },
  "waiting-list": { type: "waiting-list" },
  rejected: { type: "application-rejected" },
};

export type ResolvedEmailTemplate = Pick<
  EmailTemplateRow,
  "id" | "name" | "subject" | "body"
>;

/**
 * Resolves the active template that matches the given application status.
 * Returns null when no active template is configured for it.
 */
export async function resolveTemplateForStatus(
  status: ApplicationStatus,
): Promise<ResolvedEmailTemplate | null> {
  const selector = selectorByStatus[status];
  if (!selector) {
    return null;
  }

  const supabase = await createClient();
  let query = supabase
    .from("email_templates")
    .select("id, name, subject, body")
    .eq("active", true);

  if (selector.type) {
    query = query.eq("type", selector.type);
  } else if (selector.nameIncludes) {
    query = query.ilike("name", `%${selector.nameIncludes}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0] as ResolvedEmailTemplate;
}
