/**
 * Mock and source checks for the confirmed participant identity reader.
 *
 * These tests do not connect to Supabase and are not RLS integration tests.
 * They pass explicit row sets into the pure decision function. A live policy
 * test would be required before treating any database SELECT as complete.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_PERMISSIONS } from "@/lib/rbac/permissions";
import { executeCompetitionConfigurationSave } from "@/lib/schedule/competition-config-save-executor";
import { CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED } from "@/lib/schedule/competition-config-save-policy";
import {
  assembleConfirmedParticipantIdentities,
  confirmedExternalTeamIsActive,
  interpretConfirmedParticipantRead,
  type ConfirmedExternalIdentityRow,
} from "@/lib/schedule/confirmed-participant-identities";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function external(row: Partial<ConfirmedExternalIdentityRow> & Pick<ConfirmedExternalIdentityRow, "id">): ConfirmedExternalIdentityRow {
  return {
    id: row.id,
    applicationId: row.applicationId ?? null,
    participationStatus: row.participationStatus ?? "confirmed",
    externalActive: row.externalActive ?? true,
  };
}

function proved(input: {
  rosterRows?: { applicationId: string }[] | null;
  externalRows?: ConfirmedExternalIdentityRow[] | null;
  rosterError?: boolean;
  externalError?: boolean;
  archived?: boolean;
  tournamentFound?: boolean;
}) {
  return interpretConfirmedParticipantRead({
    tournamentFound: input.tournamentFound ?? true,
    archived: input.archived ?? false,
    rosterError: input.rosterError ?? false,
    rosterRows: input.rosterRows === undefined ? [] : input.rosterRows,
    externalError: input.externalError ?? false,
    externalRows: input.externalRows === undefined ? [] : input.externalRows,
  });
}

export function runConfirmedParticipantIdentityChecks() {
  const complete = proved({
    rosterRows: [{ applicationId: "app-b" }, { applicationId: "app-a" }],
    externalRows: [
      external({ id: "ext-c" }),
      external({ id: "ext-linked", applicationId: "app-a" }),
    ],
  });
  assert(complete.ok, "complete confirmed roster succeeds");
  if (complete.ok) {
    assert.deepEqual(
      complete.participants.map((participant) => participant.applicationId ?? participant.externalTeamId),
      ["app-a", "app-b", "ext-c"],
    );
    assert.deepEqual(Object.keys(complete.participants[0] ?? {}).sort(), ["applicationId", "externalTeamId"]);
  }

  const empty = proved({});
  assert(empty.ok && empty.participants.length === 0, "empty but complete roster succeeds");

  const applicationError = proved({
    rosterError: true,
    rosterRows: null,
    externalRows: [external({ id: "ext-c" })],
  });
  assert(!applicationError.ok && applicationError.code === "PARTICIPANT_READ_FAILED", "application query error fails closed");

  const externalError = proved({
    rosterRows: [{ applicationId: "app-a" }],
    externalError: true,
    externalRows: null,
  });
  assert(!externalError.ok && externalError.code === "PARTICIPANT_READ_FAILED", "external-team query error fails closed");

  const partial = proved({
    archived: true,
    rosterRows: [{ applicationId: "only-my-club" }],
    externalRows: [external({ id: "ext-c" })],
  });
  assert(
    !partial.ok && partial.code === "PARTICIPANT_VISIBILITY_UNPROVED",
    "RLS-filtered partial application visibility is not a complete roster",
  );

  assert(
    !ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("applications.view"),
    "TOURNAMENT_MANAGER does not receive applications.view",
  );

  const duplicate = assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: ["app-a", "app-a"],
    externalTeams: [],
  });
  assert(!duplicate.ok && duplicate.code === "DUPLICATE_PARTICIPANT", "duplicate identities are rejected");

  const mixed = proved({
    rosterRows: [{ applicationId: "app-2" }],
    externalRows: [external({ id: "ext-1" })],
  });
  assert(mixed.ok, "mixed application and external-team identities succeed");
  if (mixed.ok) {
    assert.deepEqual(
      mixed.participants.map((participant) => participant.applicationId ?? participant.externalTeamId),
      ["app-2", "ext-1"],
    );
  }

  const ambiguous = assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: [],
    externalTeams: [external({ id: "ext-1", applicationId: "app-missing" })],
  });
  assert(!ambiguous.ok && ambiguous.code === "INVALID_PARTICIPANT_IDENTITY", "both identities on one row are rejected");

  const inactive = proved({
    rosterRows: [{ applicationId: "app-a" }],
    externalRows: [
      external({ id: "ext-off", externalActive: false }),
      external({ id: "ext-new", participationStatus: "detected" }),
    ],
  });
  assert(inactive.ok && inactive.participants.length === 1, "inactive or unconfirmed external teams are excluded");
  assert.equal(confirmedExternalTeamIsActive(null), true, "null external activity matches the existing eligibility rule");
  assert.equal(confirmedExternalTeamIsActive(false), false);

  const ordered = proved({
    rosterRows: [{ applicationId: "m-2" }],
    externalRows: [external({ id: "m-1" })],
  });
  assert(
    ordered.ok && ordered.participants.map((participant) => participant.applicationId ?? participant.externalTeamId).join(",") === "m-1,m-2",
    "identities are ordered deterministically",
  );

  const reader = read("src/lib/db/confirmed-participant-read.ts");
  const action = read("src/lib/db/competition-config-actions.ts");
  const rosterQuery = read("src/lib/db/tournament-participants-queries.ts");
  const board = read("src/components/admin/TournamentScheduleBoard.tsx");
  assert(reader.includes('rpc("tournament_public_roster"'), "reader uses the public roster for accepted applications");
  assert(!reader.includes('.from("applications")'), "reader does not use the RLS-filtered applications table");
  assert(
    reader.includes('.select("id, application_id, participation_status, external_active")'),
    "external identity read selects only eligibility columns",
  );
  assert(!/email|phone|payment|contact_name|iban|service-role|serviceRole/i.test(reader), "reader exposes no private application fields and no service role");
  assert(action.includes("readConfirmedParticipantIdentities"), "inactive save uses the dedicated reader");
  assert(!action.includes("getTournamentParticipants"), "inactive save does not use the display roster reader");
  assert(rosterQuery.includes("export async function getTournamentParticipants"), "public roster reader remains available");
  assert(
    action.indexOf('return { status: "missing_columns" }') <
      action.indexOf("readConfirmedParticipantIdentities(tournamentId)"),
    "a missing migration returns before the participant read",
  );
  assert(CHAMPIONS_LEAGUE_CONFIGURATION_SAVE_ACTIVATED === false, "configuration saving stays inactive");
  assert(!board.includes("saveCompetitionConfigurationAction"), "the save action stays unwired");
  assert(!board.includes("readConfirmedParticipantIdentities"), "the identity reader stays unwired");

  return "ok";
}

export async function runConfirmedParticipantIdentitySaveChecks() {
  let updates = 0;
  const failed = await executeCompetitionConfigurationSave(
    {
      authorize: async () => "ok",
      load: async () => ({
        status: "participant_read_failed",
        code: "PARTICIPANT_READ_FAILED",
        message: "Die bestätigten Teilnehmer konnten nicht vollständig gelesen werden.",
      }),
      updateColumns: async () => {
        updates += 1;
        throw new Error("Teilnehmerfehler darf nicht schreiben.");
      },
      revalidate: () => {
        throw new Error("Teilnehmerfehler darf nicht revalidieren.");
      },
    },
    {
      tournamentId: "tournament-1",
      expectedUpdatedAt: "2026-11-21T12:00:00.000Z",
      competitionFormat: "round-robin",
      leagueMatchesPerTeam: null,
      knockoutCutoff: null,
    },
  );
  assert.equal(failed.status, "participant_read_failed");
  assert.equal(updates, 0, "participant-read failure prevents configuration writes");

  const missing = await executeCompetitionConfigurationSave(
    {
      authorize: async () => "ok",
      load: async () => ({ status: "missing_columns" }),
      updateColumns: async () => {
        updates += 1;
        throw new Error("Fehlende Migration darf nicht schreiben.");
      },
      revalidate: () => {
        throw new Error("Fehlende Migration darf nicht revalidieren.");
      },
    },
    {
      tournamentId: "tournament-1",
      expectedUpdatedAt: "2026-11-21T12:00:00.000Z",
      competitionFormat: "round-robin",
      leagueMatchesPerTeam: null,
      knockoutCutoff: null,
    },
  );
  assert.equal(missing.status, "missing_columns");
  assert.equal(updates, 0, "missing migration prevents configuration writes");
  return "ok";
}
