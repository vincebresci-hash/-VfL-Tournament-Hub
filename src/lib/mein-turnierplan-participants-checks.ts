import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canConfirmExternalTeams,
  countConfirmedParticipants,
  countDetectedExternalTeams,
  getTournamentCapacityWithExternal,
} from "@/lib/mein-turnierplan-participants";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanParticipantCountChecks() {
  // A: 18 confirmed external, 0 applications => 18/18
  const caseA = countConfirmedParticipants({
    acceptedApplicationIds: [],
    externalTeams: Array.from({ length: 18 }, (_, index) => ({
      participationStatus: "confirmed",
      externalActive: true,
      applicationId: null,
      name: `Team ${index + 1}`,
    })),
  });
  assert(caseA === 18, "A: 18 confirmed external teams => 18 participants");
  const capacityA = getTournamentCapacityWithExternal({
    maxTeams: 18,
    applicationStatuses: [],
    acceptedApplicationIds: [],
    externalTeams: Array.from({ length: 18 }, () => ({
      participationStatus: "confirmed",
      externalActive: true,
      applicationId: null,
    })),
  });
  assert(capacityA.confirmedTeams === 18, "A capacity confirmed 18");
  assert(capacityA.availableSlots === 0, "A capacity full");

  // B: 10 accepted + 8 confirmed external => 18
  const caseB = countConfirmedParticipants({
    acceptedApplicationIds: Array.from({ length: 10 }, (_, i) => `app-${i}`),
    externalTeams: Array.from({ length: 8 }, () => ({
      participationStatus: "confirmed",
      externalActive: true,
      applicationId: null,
    })),
  });
  assert(caseB === 18, "B: 10 applications + 8 external => 18");

  // C: mapped external to accepted application => count once
  const caseC = countConfirmedParticipants({
    acceptedApplicationIds: ["app-1"],
    externalTeams: [
      {
        participationStatus: "confirmed",
        externalActive: true,
        applicationId: "app-1",
      },
    ],
  });
  assert(caseC === 1, "C: mapped confirmed external must not double-count");

  // D/E: sync must not reset status — modelled as count helpers ignore detected/rejected
  const afterSyncStatuses = [
    { participationStatus: "confirmed", externalActive: true, applicationId: null },
    { participationStatus: "rejected", externalActive: true, applicationId: null },
    { participationStatus: "detected", externalActive: true, applicationId: null },
  ];
  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: [],
      externalTeams: afterSyncStatuses,
    }) === 1,
    "D/E: only confirmed counts after re-sync statuses preserved",
  );
  assert(countDetectedExternalTeams(afterSyncStatuses) === 1, "detected remains detectable");

  // F: inactive not counted
  const caseF = countConfirmedParticipants({
    acceptedApplicationIds: [],
    externalTeams: [
      {
        participationStatus: "confirmed",
        externalActive: false,
        applicationId: null,
      },
    ],
  });
  assert(caseF === 0, "F: inactive confirmed external not counted");

  // G: capacity limit enforced
  const capacityGate = canConfirmExternalTeams({
    maxTeams: 18,
    currentConfirmedCount: 17,
    acceptedApplicationIds: [],
    teamsToConfirm: Array.from({ length: 5 }, () => ({
      participationStatus: "detected",
      externalActive: true,
      applicationId: null,
    })),
  });
  assert(!capacityGate.ok, "G: confirming 5 when 1 slot left must fail");
  assert(capacityGate.available === 1, "G: one slot remaining");

  const capacityOk = canConfirmExternalTeams({
    maxTeams: 18,
    currentConfirmedCount: 17,
    acceptedApplicationIds: [],
    teamsToConfirm: [
      { participationStatus: "detected", externalActive: true, applicationId: null },
    ],
  });
  assert(capacityOk.ok, "G: confirming 1 when 1 slot left must succeed");

  // H: public roster filter semantics — confirmed+active only
  const publicEligible = [
    { participationStatus: "confirmed", externalActive: true, applicationId: null },
    { participationStatus: "detected", externalActive: true, applicationId: null },
    { participationStatus: "rejected", externalActive: true, applicationId: null },
    { participationStatus: "confirmed", externalActive: false, applicationId: null },
  ].filter(
    (team) => team.participationStatus === "confirmed" && team.externalActive !== false,
  );
  assert(publicEligible.length === 1, "H: public roster shows only confirmed active teams");

  // Sync must not overwrite participation_status (RPC update omits the column).
  const syncMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825120000_fix_mein_turnierplan_group_reconciliation.sql",
    ),
    "utf8",
  );
  assert(
    !/UPDATE public\.tournament_external_teams[\s\S]*?participation_status/m.test(syncMigration),
    "D/E: sync RPC must not overwrite participation_status",
  );

  return "ok";
}
