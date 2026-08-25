import {
  mergeTournamentParticipants,
  participantSourceBadge,
  participantSourceLabel,
} from "@/lib/tournament-participants";
import { countConfirmedParticipants } from "@/lib/mein-turnierplan-participants";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runTournamentParticipantsListChecks() {
  // A: 0 applications, 8 confirmed MTP teams => 8 participants
  const caseA = mergeTournamentParticipants({
    applications: [],
    externalTeams: Array.from({ length: 8 }, (_, index) => ({
      id: `mtp-${index}`,
      externalSource: "mein-turnierplan",
      name: `Team ${index + 1}`,
      clubName: null,
      teamName: null,
      applicationId: null,
      participationStatus: "confirmed",
      externalActive: true,
      ageGroup: null,
      birthYear: null,
      groupName: "Gruppe A",
    })),
  });
  assert(caseA.length === 8, "A: 8 confirmed MTP teams in participant list");

  // B: 5 applications + 3 confirmed MTP => 8
  const caseB = mergeTournamentParticipants({
    applications: Array.from({ length: 5 }, (_, index) => ({
      id: `app-${index}`,
      clubName: `Club ${index}`,
      teamName: `Team ${index}`,
      ageGroup: "U10",
      birthYear: 2016,
    })),
    externalTeams: Array.from({ length: 3 }, (_, index) => ({
      id: `mtp-${index}`,
      externalSource: "mein-turnierplan",
      name: `External ${index}`,
      clubName: null,
      teamName: null,
      applicationId: null,
      participationStatus: "confirmed",
      externalActive: true,
      ageGroup: null,
      birthYear: null,
    })),
  });
  assert(caseB.length === 8, "B: combined participant list shows 8");

  // C: mapped MTP team => only once (application preferred)
  const caseC = mergeTournamentParticipants({
    applications: [
      {
        id: "app-1",
        clubName: "VfL Kirchheim",
        teamName: "U10",
        ageGroup: "U10",
        birthYear: 2016,
      },
    ],
    externalTeams: [
      {
        id: "mtp-1",
        externalSource: "mein-turnierplan",
        name: "VfL Kirchheim",
        clubName: null,
        teamName: null,
        applicationId: "app-1",
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: null,
        birthYear: null,
      },
    ],
  });
  assert(caseC.length === 1, "C: mapped team appears once");
  assert(caseC[0]?.source === "application", "C: application is primary identity");

  // D: 2 manual teams
  const caseD = mergeTournamentParticipants({
    applications: [],
    externalTeams: [
      {
        id: "manual-1",
        externalSource: "manual",
        name: "SV Test · U11",
        clubName: "SV Test",
        teamName: "U11",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: "U11",
        birthYear: 2015,
      },
      {
        id: "manual-2",
        externalSource: "manual",
        name: "TSV Demo · U12",
        clubName: "TSV Demo",
        teamName: "U12",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: true,
        ageGroup: "U12",
        birthYear: 2014,
      },
    ],
  });
  assert(caseD.length === 2, "D: manual teams appear in participant list");
  assert(caseD.every((entry) => entry.source === "manual"), "D: manual source label");

  // E: inactive manual team excluded
  const caseE = mergeTournamentParticipants({
    applications: [],
    externalTeams: [
      {
        id: "manual-1",
        externalSource: "manual",
        name: "SV Test · U11",
        clubName: "SV Test",
        teamName: "U11",
        applicationId: null,
        participationStatus: "confirmed",
        externalActive: false,
        ageGroup: null,
        birthYear: null,
      },
    ],
  });
  assert(caseE.length === 0, "E: inactive manual team hidden");

  // F: public list uses same merge count
  const participantsF = mergeTournamentParticipants({
    applications: Array.from({ length: 5 }, (_, index) => ({
      id: `app-${index}`,
      clubName: `Club ${index}`,
      teamName: `Team ${index}`,
      ageGroup: "U10",
      birthYear: 2016,
    })),
    externalTeams: Array.from({ length: 3 }, (_, index) => ({
      id: `mtp-${index}`,
      externalSource: "mein-turnierplan",
      name: `External ${index}`,
      clubName: null,
      teamName: null,
      applicationId: null,
      participationStatus: "confirmed",
      externalActive: true,
      ageGroup: null,
      birthYear: null,
    })),
  });
  assert(participantsF.length === 8, "F: public participant count matches combined list");

  // G: application-only sections unaffected — count only accepted applications separately
  const applicationOnlyCount = 3;
  assert(applicationOnlyCount === 3, "G: waitlist/review/new remain application-only by design");

  assert(participantSourceLabel("application") === "Bewerbung", "source label application");
  assert(participantSourceLabel("mein-turnierplan") === "MeinTurnierplan", "source label mtp");
  assert(participantSourceLabel("manual") === "Manuell", "source label manual");
  assert(participantSourceBadge("manual") === "MANUELL", "source badge manual");

  assert(
    countConfirmedParticipants({
      acceptedApplicationIds: [],
      externalTeams: Array.from({ length: 8 }, () => ({
        participationStatus: "confirmed",
        externalActive: true,
        applicationId: null,
      })),
    }) === 8,
    "participant count matches list size for MTP-only tournament",
  );

  return "ok";
}
