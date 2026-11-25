import { scheduleParticipantId } from "@/lib/schedule/admin";
import {
  validateConfirmedParticipantIdentities,
  type ConfirmedParticipantIdentity,
} from "@/lib/schedule/competition-config";

/**
 * Pure identity contract for a future configuration save.
 *
 * Callers must pass only rows they have already proved are the complete
 * eligible set. This module does not query the database and cannot detect an
 * RLS-filtered application list. A null row set is a failed read, never an
 * empty roster.
 */
export type ConfirmedExternalIdentityRow = {
  id: string;
  applicationId: string | null;
  clubId: string | null;
  participationStatus: string;
  externalActive: boolean;
};

export type ConfirmedParticipantReadSuccess = {
  ok: true;
  participants: ConfirmedParticipantIdentity[];
  clubByParticipantId: Record<string, string | null>;
};

export type ConfirmedParticipantReadFailure = {
  ok: false;
  code:
    | "NOT_FOUND"
    | "PARTICIPANT_READ_FAILED"
    | "PARTICIPANT_VISIBILITY_UNPROVED"
    | "INVALID_PARTICIPANT_IDENTITY"
    | "DUPLICATE_PARTICIPANT";
  message: string;
};

export type ConfirmedParticipantReadResult =
  | ConfirmedParticipantReadSuccess
  | ConfirmedParticipantReadFailure;

/** Matches SQL `external_active IS TRUE`. Null and false are not confirmed. */
export function confirmedExternalTeamIsActive(externalActive: boolean | null | undefined) {
  return externalActive === true;
}

const READ_FAILED = "Die bestätigten Teilnehmer konnten nicht vollständig gelesen werden.";
const VISIBILITY_UNPROVED =
  "Die vollständige Teilnehmerliste kann für dieses Turnier nicht nachgewiesen werden.";

export function assembleConfirmedParticipantIdentities(input: {
  acceptedApplicationIds: readonly string[];
  clubByApplicationId?: Readonly<Record<string, string | null>>;
  externalTeams: readonly ConfirmedExternalIdentityRow[];
}): ConfirmedParticipantReadResult {
  const acceptedApplicationIds = input.acceptedApplicationIds.map((id) => String(id));
  const accepted = new Set(acceptedApplicationIds);
  const identities: ConfirmedParticipantIdentity[] = acceptedApplicationIds.map((applicationId) => ({
    applicationId,
    externalTeamId: null,
  }));

  for (const team of input.externalTeams) {
    if (team.participationStatus !== "confirmed" || team.externalActive !== true) {
      continue;
    }
    const applicationId = team.applicationId?.trim() ? team.applicationId : null;
    if (applicationId && accepted.has(applicationId)) {
      continue;
    }
    identities.push({
      applicationId: null,
      externalTeamId: String(team.id),
    });
  }

  const validated = validateConfirmedParticipantIdentities(identities);
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code === "DUPLICATE_PARTICIPANT" ? "DUPLICATE_PARTICIPANT" : "INVALID_PARTICIPANT_IDENTITY",
      message: validated.message,
    };
  }

  const byId = new Map(
    identities.map((identity) => [scheduleParticipantId(identity) ?? "", identity]),
  );
  const externalById = new Map(input.externalTeams.map((team) => [String(team.id), team]));
  const participants: ConfirmedParticipantIdentity[] = [];
  const clubByParticipantId: Record<string, string | null> = {};
  for (const id of validated.participantIds) {
    const identity = byId.get(id);
    if (!identity) {
      return {
        ok: false,
        code: "INVALID_PARTICIPANT_IDENTITY",
        message: "Eine bestätigte Teilnehmeridentität ist ungültig.",
      };
    }
    participants.push(identity);
    clubByParticipantId[id] = identity.applicationId
      ? input.clubByApplicationId?.[identity.applicationId] ?? null
      : externalById.get(identity.externalTeamId ?? "")?.clubId ?? null;
  }
  return {
    ok: true,
    participants,
    clubByParticipantId,
  };
}

/**
 * Decides whether a roster read is complete. Archived tournaments are not
 * covered by tournament_public_roster, and a direct applications SELECT is
 * club-scoped, so those reads fail closed instead of returning a partial list.
 */
export function interpretConfirmedParticipantRead(input: {
  tournamentFound: boolean;
  archived: boolean;
  rosterError: boolean;
  rosterRows: readonly { applicationId: string; clubId: string | null }[] | null;
  externalError: boolean;
  externalRows: readonly ConfirmedExternalIdentityRow[] | null;
}): ConfirmedParticipantReadResult {
  if (!input.tournamentFound) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Das Turnier wurde nicht gefunden.",
    };
  }
  if (input.archived) {
    return {
      ok: false,
      code: "PARTICIPANT_VISIBILITY_UNPROVED",
      message: VISIBILITY_UNPROVED,
    };
  }
  if (input.rosterError || input.rosterRows === null || input.externalError || input.externalRows === null) {
    return {
      ok: false,
      code: "PARTICIPANT_READ_FAILED",
      message: READ_FAILED,
    };
  }

  return assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: input.rosterRows.map((row) => row.applicationId),
    clubByApplicationId: Object.fromEntries(
      input.rosterRows.map((row) => [row.applicationId, row.clubId]),
    ),
    externalTeams: input.externalRows,
  });
}
