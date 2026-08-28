import { createClient } from "@/lib/supabase/server";
import { daysUntilTournament } from "@/lib/cancellations/deadline";
import type { CancellationRequestListItem } from "@/types/cancellation";

export async function listCancellationRequests(): Promise<{
  requests: CancellationRequestListItem[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cancellation_requests")
    .select(
      `
      id,
      application_id,
      requested_by_type,
      reason,
      is_late_request,
      status,
      requested_at,
      decided_at,
      decided_by,
      admin_note,
      created_at,
      updated_at,
      applications (
        status,
        club_name,
        team_name,
        contact_first_name,
        contact_last_name,
        contact_email,
        tournaments (name, slug, date)
      )
    `,
    )
    .order("requested_at", { ascending: false });

  if (error) {
    return { requests: [], ready: false };
  }

  const requests = (data ?? []).flatMap((row) => {
    const application = Array.isArray(row.applications)
      ? row.applications[0]
      : row.applications;
    const tournament = application?.tournaments
      ? Array.isArray(application.tournaments)
        ? application.tournaments[0]
        : application.tournaments
      : null;

    if (!application || !tournament) {
      return [];
    }

    return [
      {
        id: row.id,
        applicationId: row.application_id,
        requestedByType: row.requested_by_type,
        reason: row.reason,
        isLateRequest: row.is_late_request,
        status: row.status,
        requestedAt: row.requested_at,
        decidedAt: row.decided_at,
        decidedBy: row.decided_by,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tournamentName: tournament.name,
        tournamentSlug: tournament.slug,
        tournamentDate: tournament.date,
        clubName: application.club_name ?? "Verein",
        teamName: application.team_name ?? "Mannschaft",
        contactFirstName: application.contact_first_name ?? "",
        contactLastName: application.contact_last_name ?? "",
        contactEmail: application.contact_email ?? "",
        applicationStatus: application.status,
        daysUntilTournament: daysUntilTournament(tournament.date),
      } satisfies CancellationRequestListItem,
    ];
  });

  return { requests, ready: true };
}

export async function getPendingCancellationForApplication(applicationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cancellation_requests")
    .select("id, status, requested_at, is_late_request, reason")
    .eq("application_id", applicationId)
    .eq("status", "pending")
    .maybeSingle();

  return data;
}

export async function listPendingCancellationRequests() {
  const result = await listCancellationRequests();
  return {
    ...result,
    requests: result.requests.filter((request) => request.status === "pending"),
  };
}
