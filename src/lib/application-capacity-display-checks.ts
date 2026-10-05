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

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function display(input: ApplicationCapacityDisplayInput) {
  return getApplicationCapacityDisplay(input);
}

function runPublicCapacityPresentationFreezes() {
  const card = read("src/components/tournaments/TournamentCard.tsx");
  const page = read("src/app/turniere/[slug]/page.tsx");
  const hero = read("src/components/tournaments/TournamentHero.tsx");
  const infoGrid = read("src/components/tournaments/TournamentInfoGrid.tsx");
  const summary = read("src/components/apply/ApplicationCapacitySummary.tsx");
  const adminDetail = read("src/components/admin/AdminTournamentDetailView.tsx");
  const adminCard = read("src/components/admin/TournamentAdminCard.tsx");
  const actions = read("src/lib/applications/actions.ts");
  const capacityCore = read("src/lib/tournament-capacity.ts");

  // Public card: max only, no occupancy ratio / progress bar / confirmed count.
  assert(
    card.includes("Max. {capacity.maxTeams} Teams"),
    "public card renders maximum capacity copy",
  );
  assert(
    !card.includes("capacity.confirmedTeams") &&
      !card.includes("confirmedTeams /") &&
      !card.includes("capacityRatio") &&
      !card.includes("bestätigte Teams") &&
      !/width:\s*`\$\{/.test(card),
    "public card does not render confirmed/max occupancy or progress width",
  );

  // Public detail facts: max only.
  assert(
    page.includes('label: "Max. Teams"') &&
      page.includes("String(capacity.maxTeams)"),
    "public detail renders max-team information",
  );
  assert(
    !page.includes('label: "Bestätigte Teams"') &&
      !page.includes('label: "Freie Plätze"') &&
      !page.includes("capacity.availableSlots") &&
      !page.includes("String(tournament.confirmedTeams)"),
    "public detail does not render Bestätigte Teams or Freie Plätze",
  );

  // Hero: max chip, no free-places chip.
  assert(
    hero.includes("Max. {maxTeams} Teams") &&
      hero.includes("showMaxTeams") &&
      !hero.includes("freie Plätze") &&
      !hero.includes("availableSlots"),
    "hero shows max teams only (no free-places chip)",
  );
  assert(
    page.includes("showHeroMaxTeams") &&
      page.includes("showMaxTeams={showHeroMaxTeams}") &&
      page.includes("maxTeams={capacity?.maxTeams"),
    "detail page wires hero max-teams presentation",
  );

  // Info grid no longer emphasizes free places / confirmed labels.
  assert(
    !infoGrid.includes('"Bestätigte Teams"') &&
      !infoGrid.includes('"Freie Plätze"') &&
      infoGrid.includes('"Max. Teams"'),
    "info grid secondary order keeps Max. Teams only for capacity",
  );

  // Apply summary remains presentational over display helper.
  assert(
    summary.includes("getApplicationCapacityDisplay") &&
      summary.includes("display.statusLine"),
    "application capacity summary remains presentational",
  );

  // Admin capacity information retained.
  assert(
    adminDetail.includes("Freie Plätze") &&
      adminDetail.includes("capacity.confirmedTeams") &&
      adminDetail.includes("capacity.availableSlots"),
    "admin detail retains confirmed teams and free places",
  );
  assert(
    adminCard.includes("bestätigt") && adminCard.includes("confirmedTeams"),
    "admin tournament card retains confirmed capacity presentation",
  );

  // Business/application logic unchanged (no display helper coupling into submit).
  assert(
    actions.includes("submitGuestApplication") &&
      actions.includes("submitClubApplication") &&
      !actions.includes("getApplicationCapacityDisplay"),
    "application submit paths unchanged and independent of display helper",
  );
  assert(
    capacityCore.includes("getAvailableSlots") &&
      capacityCore.includes("isTournamentFull") &&
      capacityCore.includes("countApplicationsByStatus"),
    "capacity enforcement helpers remain present",
  );
}

export function runApplicationCapacityDisplayChecks() {
  // A) open with free capacity → max only, no free-place count
  const caseA = display({
    maxTeams: 12,
    confirmedTeams: 0,
    applicationState: "open",
  });
  assert(caseA?.participantLine === "Max. 12 Teams", "A: max-only participant line");
  assert(caseA?.statusLine === null, "A: no free-places status line");

  // B) open with some occupancy → still max only
  const caseB = display({
    maxTeams: 12,
    confirmedTeams: 1,
    applicationState: "open",
  });
  assert(caseB?.participantLine === "Max. 12 Teams", "B: max-only participant line");
  assert(caseB?.statusLine === null, "B: no remaining-slot status");

  // C) nearly full → still no free-place count
  const caseC = display({
    maxTeams: 12,
    confirmedTeams: 11,
    applicationState: "open",
  });
  assert(caseC?.participantLine === "Max. 12 Teams", "C: max-only participant line");
  assert(caseC?.statusLine === null, "C: no singular free-place status");

  // D) full without waitlist → max + ausgebucht status (no numeric occupancy)
  const caseD = display({
    maxTeams: 12,
    confirmedTeams: 12,
    applicationState: "closed",
  });
  assert(caseD?.participantLine === "Max. 12 Teams", "D: max-only participant line");
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

  // F/G/H/I) confirmed counting helpers remain for business logic
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
  assert(waitlist?.participantLine === "Max. 12 Teams", "waitlist max-only line");
  assert(
    waitlist?.statusLine === "Aktuell ausgebucht – Bewerbung für Warteliste möglich",
    "waitlist status line",
  );

  runPublicCapacityPresentationFreezes();

  const actions = read("src/lib/applications/actions.ts");
  assert(
    actions.includes("submitGuestApplication") && actions.includes("submitClubApplication"),
    "J: application submit paths remain",
  );
  assert(
    !actions.includes("getApplicationCapacityDisplay"),
    "J: submit actions do not depend on display helper",
  );

  const migrationDir = read("src/lib/schedule/run-checks-cli.ts");
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
