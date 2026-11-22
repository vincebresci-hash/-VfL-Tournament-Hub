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
import { buildChampionsLeagueAdminPreview } from "@/lib/schedule/league-admin-preview";
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

  const linkedPending = assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: ["app-a"],
    externalTeams: [external({ id: "ext-pending", applicationId: "app-missing" })],
  });
  assert(linkedPending.ok, "confirmed external team linked to a non-accepted application stays");
  if (linkedPending.ok) {
    const externalIdentity = linkedPending.participants.find((participant) => participant.externalTeamId === "ext-pending");
    assert(externalIdentity?.applicationId == null, "linked pending application is not a second identity");
    assert.deepEqual(
      linkedPending.participants.map((participant) => participant.applicationId ?? participant.externalTeamId),
      ["app-a", "ext-pending"],
    );
  }

  const duplicateCanonical = assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: ["same-id"],
    externalTeams: [external({ id: "same-id" })],
  });
  assert(
    !duplicateCanonical.ok && duplicateCanonical.code === "DUPLICATE_PARTICIPANT",
    "an external id that repeats an accepted application id is rejected",
  );

  const inactive = proved({
    rosterRows: [{ applicationId: "app-a" }],
    externalRows: [
      external({ id: "ext-off", externalActive: false }),
      external({ id: "ext-new", participationStatus: "detected" }),
    ],
  });
  assert(inactive.ok && inactive.participants.length === 1, "inactive or unconfirmed external teams are excluded");
  assert.equal(confirmedExternalTeamIsActive(null), false, "null external activity is not confirmed");
  assert.equal(confirmedExternalTeamIsActive(false), false);
  assert.equal(confirmedExternalTeamIsActive(true), true);

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
  assert(board.includes("confirmedRosterError"), "an unproved roster blocks the Champions League preview");

  const leagueAction = read("src/lib/db/league-schedule-actions.ts");
  const schedulePage = read("src/app/admin/turniere/[id]/spielplan/page.tsx");
  assert(leagueAction.includes("readConfirmedParticipantIdentities"), "league apply uses the confirmed roster");
  assert(!leagueAction.includes("getTournamentParticipants"), "league apply does not use the club-scoped roster");
  assert(
    leagueAction.indexOf("const confirmed = await readConfirmedParticipantIdentities") <
      leagueAction.indexOf("if (!confirmed.ok)") &&
      leagueAction.indexOf("if (!confirmed.ok)") <
        leagueAction.indexOf('supabase.rpc("apply_champions_league_league_phase"'),
    "an unproved roster returns before the league write",
  );
  assert(leagueAction.includes("sideIsCanonical"), "each persisted fixture side is one canonical id");
  assert(schedulePage.includes("readConfirmedParticipantIdentities"), "schedule preview loads the confirmed roster");
  assert(
    schedulePage.includes("confirmed.participants") && schedulePage.includes("confirmedRosterError"),
    "schedule preview does not fall back to a partial roster",
  );

  const canonical = assembleConfirmedParticipantIdentities({
    acceptedApplicationIds: ["app-1", "app-2"],
    externalTeams: [
      external({ id: "ext-3" }),
      external({ id: "ext-4", applicationId: "pending-app" }),
      external({ id: "ext-linked", applicationId: "app-1" }),
      external({ id: "ext-null", externalActive: false }),
    ],
  });
  assert(canonical.ok, "canonical roster matches the SQL identity rules");
  if (canonical.ok) {
    assert.deepEqual(
      canonical.participants.map((participant) => participant.applicationId ?? participant.externalTeamId),
      ["app-1", "app-2", "ext-3", "ext-4"],
    );
    assert(
      canonical.participants.every(
        (participant) => Boolean(participant.applicationId) !== Boolean(participant.externalTeamId),
      ),
      "canonical roster never carries both ids",
    );
    const timing = {
      startIso: "2026-12-27T08:00:00.000Z",
      durationMinutes: 12,
      breakMinutes: 3,
      minimumRestMinutes: 15,
      lunchStartIso: null,
      lunchEndIso: null,
    };
    const persistedPreview = buildChampionsLeagueAdminPreview({
      participants: canonical.participants,
      matchesPerTeam: 1,
      knockoutCutoff: 4,
      fields: [{ id: "field-1", name: "Platz 1" }],
      timing,
    });
    const sameRoster = buildChampionsLeagueAdminPreview({
      participants: [...canonical.participants].reverse(),
      matchesPerTeam: 1,
      knockoutCutoff: 4,
      fields: [{ id: "field-1", name: "Platz 1" }],
      timing,
    });
    assert.equal(persistedPreview.matches.length, 2, "preview schedules the confirmed roster");
    assert.equal(
      persistedPreview.inputFingerprint,
      sameRoster.inputFingerprint,
      "preview fingerprint follows the confirmed roster, not input order",
    );
    assert(
      persistedPreview.matches.every(
        (match) =>
          Boolean(match.home.applicationId) !== Boolean(match.home.externalTeamId) &&
          Boolean(match.away.applicationId) !== Boolean(match.away.externalTeamId),
      ),
      "every preview fixture side has exactly one canonical id",
    );
  }

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
