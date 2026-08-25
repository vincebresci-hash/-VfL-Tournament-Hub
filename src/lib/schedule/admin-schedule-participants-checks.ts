import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchSideParticipantId,
  resolveScheduleParticipantRef,
  scheduleParticipantId,
  teamLabelsFromParticipants,
} from "@/lib/schedule/admin";
import { mergeTournamentParticipants } from "@/lib/tournament-participants";
import type { TournamentMatchRecord } from "@/types/schedule";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * REG-002: Admin Gruppen/Spielplan must use the unified participant model.
 */
export function runAdminScheduleParticipantChecks() {
  // A) 8 accepted applications only
  const appsOnly = mergeTournamentParticipants({
    applications: Array.from({ length: 8 }, (_, index) => ({
      id: `app-${index}`,
      clubName: `Club ${index}`,
      teamName: `Team ${index}`,
      ageGroup: "U10",
      birthYear: 2016,
    })),
    externalTeams: [],
  });
  assert(appsOnly.length === 8, "A: 8 applications");
  assert(
    appsOnly.every((participant) => scheduleParticipantId(participant)?.startsWith("app-")),
    "A: schedule ids are application UUIDs",
  );

  // B) 0 applications + 8 MTP
  const mtpOnly = mergeTournamentParticipants({
    applications: [],
    externalTeams: Array.from({ length: 8 }, (_, index) => ({
      id: `mtp-${index}`,
      externalSource: "mein-turnierplan",
      name: `MTP ${index}`,
      clubName: null,
      teamName: null,
      applicationId: null,
      participationStatus: "confirmed",
      externalActive: true,
      ageGroup: null,
      birthYear: null,
    })),
  });
  assert(mtpOnly.length === 8, "B: 8 MTP teams");
  assert(
    mtpOnly.every((participant) => scheduleParticipantId(participant)?.startsWith("mtp-")),
    "B: schedule ids are external UUIDs",
  );

  // C) 5 apps + 3 MTP
  const mixed = mergeTournamentParticipants({
    applications: Array.from({ length: 5 }, (_, index) => ({
      id: `app-${index}`,
      clubName: `Club ${index}`,
      teamName: `Team ${index}`,
      ageGroup: null,
      birthYear: null,
    })),
    externalTeams: Array.from({ length: 3 }, (_, index) => ({
      id: `mtp-${index}`,
      externalSource: "mein-turnierplan",
      name: `MTP ${index}`,
      clubName: null,
      teamName: null,
      applicationId: null,
      participationStatus: "confirmed",
      externalActive: true,
      ageGroup: null,
      birthYear: null,
    })),
  });
  assert(mixed.length === 8, "C: 5+3 = 8");

  // D) 2 manual teams
  const manuals = mergeTournamentParticipants({
    applications: [],
    externalTeams: [
      {
        id: "man-1",
        externalSource: "manual",
        name: "Manual One",
        clubName: "Manual One",
        teamName: "I",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: null,
        birthYear: null,
      },
      {
        id: "man-2",
        externalSource: "manual",
        name: "Manual Two",
        clubName: "Manual Two",
        teamName: "I",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: null,
        birthYear: null,
      },
    ],
  });
  assert(manuals.length === 2, "D: 2 manual teams");
  assert(manuals.every((participant) => participant.source === "manual"), "D: source manual");

  // E) mapped MTP onto accepted application => once
  const mapped = mergeTournamentParticipants({
    applications: [
      {
        id: "app-1",
        clubName: "Club",
        teamName: "A",
        ageGroup: null,
        birthYear: null,
      },
    ],
    externalTeams: [
      {
        id: "mtp-1",
        externalSource: "mein-turnierplan",
        name: "Club",
        clubName: "Club",
        teamName: "A",
        applicationId: "app-1",
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: null,
        birthYear: null,
      },
    ],
  });
  assert(mapped.length === 1, "E: mapped MTP deduped");
  assert(mapped[0]?.applicationId === "app-1", "E: application wins");

  // F) Match side resolution for external-only fixtures
  const externalMatch = {
    homeApplicationId: null,
    awayApplicationId: null,
    homeExternalTeamId: "mtp-0",
    awayExternalTeamId: "mtp-1",
  } as Pick<
    TournamentMatchRecord,
    "homeApplicationId" | "awayApplicationId" | "homeExternalTeamId" | "awayExternalTeamId"
  >;
  assert(matchSideParticipantId(externalMatch, "home") === "mtp-0", "F: home external id");
  assert(matchSideParticipantId(externalMatch, "away") === "mtp-1", "F: away external id");

  const labels = teamLabelsFromParticipants(mtpOnly);
  assert(labels["mtp-0"], "F: labels include external ids");
  assert(
    resolveScheduleParticipantRef("mtp-0", mtpOnly)?.externalTeamId === "mtp-0",
    "F: resolve external ref",
  );
  assert(
    resolveScheduleParticipantRef("app-0", appsOnly)?.applicationId === "app-0",
    "F: resolve application ref",
  );

  // Wiring: admin pages use getTournamentParticipants
  const groupsPage = readSource("src/app/admin/turniere/[id]/gruppen/page.tsx");
  const schedulePage = readSource("src/app/admin/turniere/[id]/spielplan/page.tsx");
  assert(groupsPage.includes("getTournamentParticipants"), "G: groups page uses unified participants");
  assert(!groupsPage.includes("acceptedParticipants("), "G: groups page no longer apps-only");
  assert(schedulePage.includes("getTournamentParticipants"), "G: schedule page uses unified participants");
  assert(schedulePage.includes("teamLabelsFromParticipants"), "G: schedule labels from participants");
  assert(!schedulePage.includes("teamLabelsFromApplications"), "G: schedule not apps-only labels");

  const groupsBoard = readSource("src/components/admin/TournamentGroupsBoard.tsx");
  assert(groupsBoard.includes("TournamentParticipant"), "G: groups board typed to participants");
  assert(groupsBoard.includes("participantSourceLabel"), "G: source labels shown");

  const scheduleActions = readSource("src/lib/db/schedule-actions.ts");
  assert(scheduleActions.includes("getTournamentParticipants"), "actions load unified participants");
  assert(scheduleActions.includes("home_external_team_id"), "actions write external match columns");
  assert(scheduleActions.includes("external_team_id"), "actions write external group members");

  const scheduleBoard = readSource("src/components/admin/TournamentScheduleBoard.tsx");
  assert(scheduleBoard.includes("matchSideParticipantId"), "schedule board reads external match sides");

  return "ok";
}
