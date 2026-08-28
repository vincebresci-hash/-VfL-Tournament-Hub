import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getPublicApplicationState,
  getPublicApplicationStatusDisplay,
  publicApplicationStateLabel,
  type PublicApplicationGateInput,
} from "@/lib/public-application-state";
import { tournamentStatusLabel } from "@/lib/tournament-status";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function gate(
  overrides: Partial<PublicApplicationGateInput> = {},
): PublicApplicationGateInput {
  return {
    status: "active",
    applicationsEnabled: true,
    applicationsOpen: true,
    archivedAt: null,
    availableSlots: 4,
    waitlistEnabled: false,
    isFull: false,
    applicationStart: "2026-08-01T00:00:00.000Z",
    applicationDeadline: "2026-08-30T21:59:59.000Z",
    maxTeams: 16,
    now: new Date("2026-08-20T18:00:00.000Z"),
    ...overrides,
  };
}

function detailPageSource() {
  return readFileSync(
    join(process.cwd(), "src/app/turniere/[slug]/page.tsx"),
    "utf8",
  );
}

export function runPublicApplicationStatusDisplayChecks() {
  const pageSource = detailPageSource();

  // A) active + Bewerbung offen → genau 1 Badge
  const caseA = getPublicApplicationStatusDisplay(gate());
  assert(caseA.state === "open", "A: state open");
  assert(caseA.label === "Bewerbung offen", "A: Bewerbung offen label");

  // B) active + Deadline abgelaufen → geschlossen
  const caseB = getPublicApplicationStatusDisplay(
    gate({ applicationDeadline: "2026-08-19T21:59:59.000Z" }),
  );
  assert(caseB.state === "closed", "B: state closed");
  assert(caseB.label === "Bewerbung geschlossen", "B: closed after deadline");

  // C) application_start in Zukunft
  const caseC = getPublicApplicationStatusDisplay(
    gate({ applicationStart: "2026-08-21T00:00:00.000Z" }),
  );
  assert(caseC.state === "coming-soon", "C: coming-soon state");
  assert(
    caseC.label === publicApplicationStateLabel["coming-soon"],
    "C: coming-soon label",
  );

  // D) voll + Warteliste aktiv
  const caseD = getPublicApplicationStatusDisplay(
    gate({
      isFull: true,
      availableSlots: 0,
      waitlistEnabled: true,
    }),
  );
  assert(caseD.state === "waitlist", "D: waitlist state");
  assert(caseD.label === publicApplicationStateLabel.waitlist, "D: waitlist label");

  // E) voll + Warteliste aus → Ausgebucht
  const caseE = getPublicApplicationStatusDisplay(
    gate({
      isFull: true,
      availableSlots: 0,
      waitlistEnabled: false,
    }),
  );
  assert(caseE.state === "closed", "E: closed when full without waitlist");
  assert(caseE.label === "Ausgebucht", "E: Ausgebucht label");

  // F) applications_open=false → geschlossen
  const caseF = getPublicApplicationStatusDisplay(
    gate({ applicationsOpen: false }),
  );
  assert(caseF.state === "closed", "F: closed when applications_open=false");
  assert(caseF.label === "Bewerbung geschlossen", "F: geschlossen label");

  // G) Detailseite zeigt kein konkurrierendes Turnier-Status-Badge
  assert(!pageSource.includes("StatusBadge"), "G: no StatusBadge on detail page");
  assert(
    !pageSource.includes("getEffectiveTournamentStatus"),
    "G: no effective tournament status on detail page",
  );
  assert(
    pageSource.includes("getPublicApplicationStatusDisplay"),
    "G: uses consolidated application status display",
  );

  // H) u12-master-cup Szenario: active + Deadline abgelaufen → kein „Bewerbung offen“
  const caseH = getPublicApplicationStatusDisplay(
    gate({ applicationDeadline: "2026-08-19T21:59:59.000Z" }),
  );
  assert(caseH.label === "Bewerbung geschlossen", "H: closed label");
  assert(
    caseH.label !== tournamentStatusLabel.active,
    "H: no Bewerbung offen tournament badge label",
  );
  assert(
    getPublicApplicationState(
      gate({ applicationDeadline: "2026-08-19T21:59:59.000Z" }),
    ) === "closed",
    "H: application gate closed",
  );

  // I) u10-herbst-cup Szenario: active + offen → genau „Bewerbung offen“, nicht doppelt
  const caseI = getPublicApplicationStatusDisplay(gate());
  assert(caseI.label === "Bewerbung offen", "I: single Bewerbung offen label");
  assert(
    caseI.label !== "Anmeldung offen",
    "I: no legacy Anmeldung offen label",
  );

  return "ok";
}
