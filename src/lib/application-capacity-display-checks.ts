import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getApplicationCapacityDisplay,
  type ApplicationCapacityDisplayInput,
} from "@/lib/application-capacity-display";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function display(input: ApplicationCapacityDisplayInput) {
  return getApplicationCapacityDisplay(input);
}

export function runApplicationCapacityDisplayChecks() {
  // A) 0/12 → 12 frei
  const caseA = display({
    maxTeams: 12,
    confirmedTeams: 0,
    applicationState: "open",
  });
  assert(caseA?.participantLine === "0 von 12 Teams bestätigt", "A: participant line");
  assert(caseA?.statusLine === "Noch 12 Plätze frei", "A: 12 slots free");

  // B) 1/12 → 11 frei
  const caseB = display({
    maxTeams: 12,
    confirmedTeams: 1,
    applicationState: "open",
  });
  assert(caseB?.statusLine === "Noch 11 Plätze frei", "B: 11 slots free");

  // C) 11/12 → 1 frei
  const caseC = display({
    maxTeams: 12,
    confirmedTeams: 11,
    applicationState: "open",
  });
  assert(caseC?.statusLine === "Noch 1 Platz frei", "C: singular slot label");

  // D) 12/12 → ausgebucht
  const caseD = display({
    maxTeams: 12,
    confirmedTeams: 12,
    applicationState: "closed",
  });
  assert(caseD?.statusLine === "Aktuell ausgebucht", "D: full without waitlist");

  // E) undefined capacity → no display
  assert(
    display({
      maxTeams: null,
      confirmedTeams: 0,
      applicationState: "open",
    }) === null,
    "E: undefined capacity hides display",
  );

  // F/G/H/I) confirmed counts only accepted applications
  const counts = countApplicationsByStatus([
    "accepted",
    "under-review",
    "waiting-list",
    "rejected",
    "new",
  ]);
  assert(counts.confirmedTeams === 1, "I: accepted counted");
  assert(counts.underReviewCount === 1, "H: under-review excluded from confirmed");
  assert(counts.waitingListCount === 1, "F: waiting-list excluded from confirmed");
  const rejectedOnly = countApplicationsByStatus(["rejected", "waiting-list", "new"]);
  assert(rejectedOnly.confirmedTeams === 0, "G: rejected excluded from confirmed");

  const waitlist = display({
    maxTeams: 12,
    confirmedTeams: 12,
    applicationState: "waitlist",
  });
  assert(
    waitlist?.statusLine === "Aktuell ausgebucht – Bewerbung für Warteliste möglich",
    "waitlist status line",
  );

  const actions = readFileSync(
    join(process.cwd(), "src/lib/applications/actions.ts"),
    "utf8",
  );
  assert(
    actions.includes("submitGuestApplication") && actions.includes("submitClubApplication"),
    "J: application submit paths remain",
  );
  assert(
    !actions.includes("getApplicationCapacityDisplay"),
    "J: submit actions do not depend on display helper",
  );

  const migrationDir = readFileSync(
    join(process.cwd(), "src/lib/schedule/run-checks-cli.ts"),
    "utf8",
  );
  assert(
    migrationDir.includes("duplicate-application-checks"),
    "duplicate protection checks remain wired",
  );
  assert(
    migrationDir.includes("status-email-idempotency-checks"),
    "mail idempotency checks remain wired",
  );

  return "ok";
}
