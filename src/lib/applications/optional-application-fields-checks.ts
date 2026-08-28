import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createEmptyApplicationForm,
  validateApplicationForm,
} from "@/lib/application";
import { displayValue } from "@/components/admin/AdminPanel";
import { optionalApplicationText } from "@/lib/applications/guest-application-fields";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260819170000_init_tournament_hub.sql"),
    "utf8",
  );
}

function readGuestMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260820110500_guest_applications.sql"),
    "utf8",
  );
}

function readActionsSource() {
  return readFileSync(join(process.cwd(), "src/lib/applications/actions.ts"), "utf8");
}

function readApplicationFormSource() {
  return readFileSync(
    join(process.cwd(), "src/components/apply/ApplicationForm.tsx"),
    "utf8",
  );
}

function readApplicationDetailSource() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/ApplicationDetail.tsx"),
    "utf8",
  );
}

function readReceivedMailSource() {
  return readFileSync(join(process.cwd(), "src/lib/email/received-mail.ts"), "utf8");
}

function readStatusMailSource() {
  return readFileSync(join(process.cwd(), "src/lib/email/status-mail.ts"), "utf8");
}

function validApplicationValues() {
  return {
    ...createEmptyApplicationForm("U10"),
    clubName: "VfL Kirchheim",
    clubCity: "Kirchheim",
    teamName: "VfL Kirchheim U10",
    birthYear: "2016",
    selfRatedStrength: "3",
    contactFirstName: "Max",
    contactLastName: "Mustermann",
    contactRole: "Trainer",
    contactEmail: "trainer@example.de",
    dataAccurate: true,
    privacyAccepted: true,
  };
}

export function runOptionalApplicationFieldsChecks() {
  const initMigration = readMigration();
  const guestMigration = readGuestMigration();
  const actions = readActionsSource();
  const applicationForm = readApplicationFormSource();
  const applicationDetail = readApplicationDetailSource();
  const receivedMail = readReceivedMailSource();
  const statusMail = readStatusMailSource();

  assert(
    initMigration.includes("contact_phone text,"),
    "DB: applications.contact_phone must exist",
  );
  assert(
    !initMigration.includes("contact_phone text NOT NULL"),
    "DB: applications.contact_phone must be nullable",
  );
  assert(
    initMigration.includes("league text,"),
    "DB: teams.league must exist and be nullable",
  );
  assert(
    guestMigration.includes("ADD COLUMN IF NOT EXISTS league text"),
    "DB: applications.league must exist",
  );

  assert(
    actions.includes("optionalApplicationText(values.league)"),
    "snapshot must normalize empty league to null",
  );
  assert(
    actions.includes("optionalApplicationText(values.contactPhone)"),
    "snapshot must normalize empty contact phone to null",
  );
  assert(
    applicationForm.includes('label="Aktuelle Spielklasse / Liga" optional'),
    "UI: league field must be optional",
  );
  assert(
    applicationForm.includes('label="Telefonnummer" optional'),
    "UI: phone field must be optional",
  );
  assert(
    applicationDetail.includes("displayValue(application.league)"),
    "admin: league must use displayValue",
  );
  assert(
    applicationDetail.includes("displayValue(application.contactPhone)"),
    "admin: phone must use displayValue",
  );

  assert(
    !receivedMail.includes("contact_phone") && !receivedMail.includes("league"),
    "received mail must not depend on phone or league",
  );
  assert(
    !statusMail.includes("contact_phone") && !statusMail.includes("league"),
    "status mail must not depend on phone or league",
  );

  const withValues = validApplicationValues();

  // A) guest without phone
  const guestWithoutPhone = validateApplicationForm({
    ...withValues,
    contactPhone: "",
    league: "Bezirksliga",
  });
  assert(!guestWithoutPhone.contactPhone, "A: guest without phone passes");

  // B) guest without league
  const guestWithoutLeague = validateApplicationForm({
    ...withValues,
    contactPhone: "07121 123456",
    league: "",
  });
  assert(!guestWithoutLeague.league, "B: guest without league passes");

  // C) guest without phone and league
  const guestWithoutBoth = validateApplicationForm({
    ...withValues,
    contactPhone: "",
    league: "",
  });
  assert(
    !guestWithoutBoth.contactPhone && !guestWithoutBoth.league,
    "C: guest without phone and league passes",
  );

  // D) guest with both
  const guestWithBoth = validateApplicationForm({
    ...withValues,
    contactPhone: "07121 123456",
    league: "Bezirksliga",
  });
  assert(
    Object.keys(guestWithBoth).length === 0,
    "D: guest with both optional fields passes",
  );

  // E) club without phone (same validation path)
  const clubWithoutPhone = validateApplicationForm({
    ...withValues,
    contactPhone: "",
    league: "Landesliga",
  });
  assert(!clubWithoutPhone.contactPhone, "E: club without phone passes");

  // F) club without league
  const clubWithoutLeague = validateApplicationForm({
    ...withValues,
    contactPhone: "07121 123456",
    league: "",
  });
  assert(!clubWithoutLeague.league, "F: club without league passes");

  // G) club without both
  const clubWithoutBoth = validateApplicationForm({
    ...withValues,
    contactPhone: "",
    league: "",
  });
  assert(
    !clubWithoutBoth.contactPhone && !clubWithoutBoth.league,
    "G: club without both passes",
  );

  // H) club with both
  const clubWithBoth = validateApplicationForm({
    ...withValues,
    contactPhone: "07121 123456",
    league: "Landesliga",
  });
  assert(Object.keys(clubWithBoth).length === 0, "H: club with both passes");

  // existing values still normalize correctly
  assert(
    optionalApplicationText("07121 123456") === "07121 123456",
    "existing phone value is preserved",
  );
  assert(
    optionalApplicationText("Bezirksliga") === "Bezirksliga",
    "existing league value is preserved",
  );
  assert(optionalApplicationText("") === null, "empty phone becomes null");
  assert(optionalApplicationText("   ") === null, "whitespace phone becomes null");
  assert(optionalApplicationText("") === null, "empty league becomes null");

  // I) admin missing phone clean
  assert(displayValue("") === "—", "I: admin missing phone shows em dash");
  assert(displayValue(null) === "—", "I: admin null phone shows em dash");

  // J) admin missing league clean
  assert(displayValue(undefined) === "—", "J: admin missing league shows em dash");

  // K/L) mail templates safe without phone/league placeholders
  assert(
    !receivedMail.includes("{{phone}}") &&
      !receivedMail.includes("{{league}}") &&
      !statusMail.includes("{{phone}}") &&
      !statusMail.includes("{{league}}"),
    "K/L: mail templates have no phone/league placeholders",
  );

  // regression: guest RPC and club insert paths remain
  assert(
    actions.includes('create_guest_application'),
    "guest RPC path must remain",
  );
  assert(
    actions.includes('.from("applications")'),
    "club insert path must remain",
  );
  assert(
    actions.includes("isDuplicateTeamApplicationViolation"),
    "duplicate protection must remain",
  );
  assert(
    actions.includes("sendApplicationReceivedEmail"),
    "received mail path must remain",
  );

  return "ok";
}
