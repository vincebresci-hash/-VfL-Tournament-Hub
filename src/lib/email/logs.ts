import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import {
  EMAIL_LOG_STATUSES,
  type EmailLogStatus,
  type EmailLogView,
} from "@/types/admin";
import type {
  ApplicationRow,
  ClubRow,
  EmailTemplateRow,
  TeamRow,
  TournamentRow,
} from "@/lib/supabase/database";

export type RecordEmailLogInput = {
  applicationId?: string | null;
  templateId?: string | null;
  recipient: string;
  subject?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  status: EmailLogStatus;
  errorMessage?: string | null;
  sentAt?: string | null;
};

function asStatus(value: string | null | undefined): EmailLogStatus {
  if (value && EMAIL_LOG_STATUSES.includes(value as EmailLogStatus)) {
    return value as EmailLogStatus;
  }

  return "pending";
}

/**
 * Persists a single email delivery attempt.
 *
 * Never throws: a failure to write the log must not break the surrounding
 * business logic (application save / status change). Errors are reported via
 * the return value and logged server-side without any secrets.
 */
export async function recordEmailLog(
  input: RecordEmailLogInput,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("email_logs").insert({
      application_id: input.applicationId ?? null,
      template_id: input.templateId ?? null,
      recipient: input.recipient,
      subject: input.subject ?? null,
      provider: input.provider ?? null,
      provider_message_id: input.providerMessageId ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
      sent_at: input.sentAt ?? (input.status === "sent" ? new Date().toISOString() : null),
    });

    if (error) {
      console.error("[email] Konnte E-Mail-Log nicht speichern:", error.message);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error(
      "[email] Unerwarteter Fehler beim Speichern des E-Mail-Logs:",
      error instanceof Error ? error.message : "unbekannt",
    );
    return { ok: false };
  }
}

type EmailLogRowWithRelations = {
  id: string;
  application_id: string | null;
  template_id: string | null;
  recipient: string;
  subject: string | null;
  provider: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  email_templates?:
    | Pick<EmailTemplateRow, "name">
    | Pick<EmailTemplateRow, "name">[]
    | null;
  applications?:
    | (Pick<ApplicationRow, "id"> & {
        clubs?: Pick<ClubRow, "name"> | Pick<ClubRow, "name">[] | null;
        teams?: Pick<TeamRow, "name"> | Pick<TeamRow, "name">[] | null;
        tournaments?:
          | Pick<TournamentRow, "id" | "name">
          | Pick<TournamentRow, "id" | "name">[]
          | null;
      })
    | (Pick<ApplicationRow, "id"> & Record<string, unknown>)[]
    | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/**
 * Lists email delivery logs for the admin area. RLS ensures only
 * admin / super-admin users receive rows.
 */
export async function listEmailLogs(): Promise<{
  logs: EmailLogView[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_logs")
    .select(
      `
      id,
      application_id,
      template_id,
      recipient,
      subject,
      provider,
      status,
      error_message,
      sent_at,
      created_at,
      email_templates ( name ),
      applications (
        id,
        clubs ( name ),
        teams ( name ),
        tournaments ( id, name )
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    return { logs: [], ready: !isMissingRelationError(error) };
  }

  const rows = data as unknown as EmailLogRowWithRelations[];

  const logs: EmailLogView[] = rows.map((row) => {
    const template = first(row.email_templates);
    const application = first(row.applications) as
      | (Pick<ApplicationRow, "id"> & {
          clubs?: Pick<ClubRow, "name"> | Pick<ClubRow, "name">[] | null;
          teams?: Pick<TeamRow, "name"> | Pick<TeamRow, "name">[] | null;
          tournaments?:
            | Pick<TournamentRow, "id" | "name">
            | Pick<TournamentRow, "id" | "name">[]
            | null;
        })
      | null;
    const club = application ? first(application.clubs) : null;
    const team = application ? first(application.teams) : null;
    const tournament = application ? first(application.tournaments) : null;

    return {
      id: row.id,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      recipient: row.recipient,
      subject: row.subject,
      status: asStatus(row.status),
      provider: row.provider,
      errorMessage: row.error_message,
      templateName: template?.name ?? null,
      clubName: club?.name ?? null,
      teamName: team?.name ?? null,
      tournamentId: tournament?.id ?? null,
      tournamentName: tournament?.name ?? null,
    };
  });

  return { logs, ready: true };
}
