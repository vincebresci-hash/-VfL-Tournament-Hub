"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin, canAccessClub } from "@/lib/auth/roles";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  isLateCancellationRequest,
  requiresCancellationReason,
} from "@/lib/cancellations/deadline";
import { sendCancellationWorkflowEmails } from "@/lib/cancellations/cancellation-mail";
import {
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
} from "@/lib/cancellations/tokens";
import { toApplicationPayment } from "@/lib/payments/mappers";
import { loadExternalParticipationPaymentByToken } from "@/lib/payments/external-payment";
import type { ParticipationPortalView } from "@/types/cancellation";

export type ActionResult = {
  error: string | null;
  notice?: string | null;
};

async function getPendingCancellationRequestId(applicationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cancellation_requests")
    .select("id")
    .eq("application_id", applicationId)
    .eq("status", "pending")
    .maybeSingle();

  return data?.id ?? null;
}

export async function loadParticipationPortalByToken(
  token: string,
): Promise<ParticipationPortalView | null> {
  if (!isValidSecureAccessTokenFormat(token)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_secure_access_token", {
    p_token_hash: hashSecureAccessToken(token),
    p_purpose: "cancellation",
  });

  if (error || !data?.[0]) {
    return null;
  }

  const row = data[0];
  const pendingId = await getPendingCancellationRequestId(row.application_id);
  const payment =
    (await loadExternalParticipationPaymentByToken({
      token,
      purpose: "cancellation",
    })) ??
    toApplicationPayment({
      payment_status: "pending",
      participation_fee: null,
      paid_at: null,
      payment_note: null,
    });
  const tournamentDate = row.tournament_date;
  const daysUntil = tournamentDate
    ? Math.ceil(
        (Date.parse(`${tournamentDate}T00:00:00Z`) -
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          )) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  return {
    tokenId: row.token_id,
    applicationId: row.application_id,
    tournamentName: row.tournament_name,
    teamName: row.team_name,
    tournamentDate,
    daysUntilTournament: daysUntil,
    isLateRequestWindow: tournamentDate
      ? isLateCancellationRequest(tournamentDate)
      : false,
    hasPendingRequest: Boolean(pendingId),
    ...payment,
  };
}

export async function submitClubCancellationRequestAction(input: {
  applicationId: string;
  reason: string;
}): Promise<ActionResult> {
  const session = await getAuthSession();
  if (!session || !canAccessClub(session.user.role) || !session.user.clubId) {
    return { error: "Kein Vereinszugang." };
  }

  const supabase = await createClient();
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select(
      "id, status, club_id, contact_email, contact_first_name, contact_last_name, club_name, team_name, tournaments (name, slug, date)",
    )
    .eq("id", input.applicationId)
    .eq("club_id", session.user.clubId)
    .maybeSingle();

  if (applicationError || !application) {
    return { error: "Bewerbung nicht gefunden." };
  }

  if (application.status !== "accepted") {
    return { error: "Eine Absageanfrage ist nur für angenommene Teilnahmen möglich." };
  }

  const tournament = Array.isArray(application.tournaments)
    ? application.tournaments[0]
    : application.tournaments;

  if (!tournament?.date) {
    return { error: "Turnierdatum fehlt." };
  }

  const reason = input.reason.trim();
  const isLate = isLateCancellationRequest(tournament.date);
  if (requiresCancellationReason(tournament.date) && !reason) {
    return {
      error:
        "Weniger als 14 Tage vor Turnierbeginn ist ein triftiger Absagegrund erforderlich.",
    };
  }

  const { data: created, error } = await supabase
    .from("cancellation_requests")
    .insert({
      application_id: input.applicationId,
      requested_by_type: "club",
      reason: reason || null,
      is_late_request: isLate,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return { error: "Es liegt bereits eine offene Absageanfrage vor." };
    }

    return {
      error: toUserFacingDbError("Die Absageanfrage konnte nicht gespeichert werden.", error),
    };
  }

  await sendCancellationWorkflowEmails({
    requestId: created.id,
    applicationId: input.applicationId,
    actorId: session.user.id,
  });

  return {
    error: null,
    notice: "Absage angefragt",
  };
}

export async function submitExternalCancellationRequestAction(input: {
  token: string;
  reason: string;
}): Promise<ActionResult> {
  if (!isValidSecureAccessTokenFormat(input.token)) {
    return { error: "Ungültiger Link." };
  }

  const supabase = await createClient();
  const tokenHash = hashSecureAccessToken(input.token);

  const { data: requestId, error } = await supabase.rpc(
    "submit_cancellation_request_external",
    {
      p_token_hash: tokenHash,
      p_reason: input.reason,
    },
  );

  if (error || !requestId) {
    const message = error?.message ?? "";
    if (message.includes("reason required")) {
      return {
        error:
          "Weniger als 14 Tage vor Turnierbeginn ist ein triftiger Absagegrund erforderlich.",
      };
    }

    if (message.includes("pending request")) {
      return { error: "Es liegt bereits eine offene Absageanfrage vor." };
    }

    if (message.includes("rate limited")) {
      return { error: "Zu viele Versuche. Bitte später erneut versuchen." };
    }

    return { error: "Die Absageanfrage konnte nicht gespeichert werden." };
  }

  const portal = await loadParticipationPortalByToken(input.token);
  await sendCancellationWorkflowEmails({
    requestId: String(requestId),
    applicationId: portal?.applicationId ?? "",
    actorId: null,
    externalTokenHash: tokenHash,
  });

  return {
    error: null,
    notice: "Absage angefragt",
  };
}

export async function decideCancellationRequestAction(input: {
  requestId: string;
  decision: "confirmed" | "rejected";
  adminNote?: string;
}): Promise<ActionResult> {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { error: "Kein Adminzugang." };
  }

  const supabase = await createClient();
  const { data: requestRow } = await supabase
    .from("cancellation_requests")
    .select("id, application_id, status")
    .eq("id", input.requestId)
    .maybeSingle();

  if (!requestRow || requestRow.status !== "pending") {
    return { error: "Absageanfrage nicht gefunden oder bereits entschieden." };
  }

  const { error } = await supabase.rpc("decide_cancellation_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_admin_note: input.adminNote?.trim() || null,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Die Entscheidung konnte nicht gespeichert werden.", error),
    };
  }

  if (input.decision === "confirmed") {
    await sendCancellationWorkflowEmails({
      requestId: input.requestId,
      applicationId: requestRow.application_id,
      actorId: session.user.id,
      decision: "confirmed",
    });
  } else {
    await sendCancellationWorkflowEmails({
      requestId: input.requestId,
      applicationId: requestRow.application_id,
      actorId: session.user.id,
      decision: "rejected",
      adminNote: input.adminNote?.trim() || "",
    });
  }

  return { error: null };
}