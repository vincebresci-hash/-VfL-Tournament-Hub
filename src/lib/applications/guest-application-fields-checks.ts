import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  guestApplicationFieldSnapshot,
  normalizeClubType,
  optionalApplicationText,
} from "@/lib/applications/guest-application-fields";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260828120000_guest_application_fields.sql",
    ),
    "utf8",
  );
}

function readActionsSource() {
  return readFileSync(join(process.cwd(), "src/lib/applications/actions.ts"), "utf8");
}

function readMappersSource() {
  return readFileSync(join(process.cwd(), "src/lib/db/mappers.ts"), "utf8");
}

export function runGuestApplicationFieldsChecks() {
  const migration = readMigration();
  const actions = readActionsSource();
  const mappers = readMappersSource();

  assert(
    migration.includes("ADD COLUMN IF NOT EXISTS website text"),
    "migration must add website column",
  );
  assert(
    migration.includes("ADD COLUMN IF NOT EXISTS club_type text"),
    "migration must add club_type column",
  );
  assert(
    migration.includes("ADD COLUMN IF NOT EXISTS alternative_phone text"),
    "migration must add alternative_phone column",
  );
  assert(
    migration.includes("NULLIF(btrim(p_payload ->> 'website'), '')"),
    "RPC must persist website",
  );
  assert(
    migration.includes("v_club_type"),
    "RPC must validate club_type",
  );
  assert(
    migration.includes("alternative_phone"),
    "RPC must persist alternative_phone",
  );
  assert(
    migration.includes("SECURITY DEFINER"),
    "RPC must remain SECURITY DEFINER",
  );
  assert(
    migration.includes("SET search_path = public"),
    "RPC must pin search_path",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.create_guest_application(jsonb) TO anon"),
    "RPC grant for anon must remain",
  );

  assert(
    actions.includes("guestApplicationFieldSnapshot"),
    "application snapshot must include guest field mapping",
  );
  assert(
    actions.includes("create_guest_application"),
    "guest submit must still use RPC",
  );
  assert(
    !actions.includes("DUPLICATE_TEAM_APPLICATION_MESSAGE") ||
      actions.includes("isDuplicateTeamApplicationViolation"),
    "duplicate protection must remain in club submit",
  );

  assert(
    mappers.includes("row.website"),
    "mapper must read application website column",
  );
  assert(
    mappers.includes("asClubType(row.club_type)"),
    "mapper must read application club_type column",
  );
  assert(
    mappers.includes("row.alternative_phone"),
    "mapper must read application alternative_phone column",
  );

  // A) without optional fields
  const empty = guestApplicationFieldSnapshot({
    website: "",
    clubType: "",
    alternativePhone: "",
  });
  assert(empty.website === null, "A: empty website becomes null");
  assert(empty.club_type === null, "A: empty clubType becomes null");
  assert(empty.alternative_phone === null, "A: empty alternativePhone becomes null");

  // B) website
  const withWebsite = guestApplicationFieldSnapshot({
    website: "www.example.de",
    clubType: "",
    alternativePhone: "",
  });
  assert(withWebsite.website === "www.example.de", "B: website is forwarded");

  // C) clubType
  const withClubType = guestApplicationFieldSnapshot({
    website: "",
    clubType: "performance",
    alternativePhone: "",
  });
  assert(withClubType.club_type === "performance", "C: clubType is forwarded");

  // D) alternativePhone
  const withAltPhone = guestApplicationFieldSnapshot({
    website: "",
    clubType: "",
    alternativePhone: "07021 123456",
  });
  assert(
    withAltPhone.alternative_phone === "07021 123456",
    "D: alternativePhone is forwarded",
  );

  // E) all three together
  const all = guestApplicationFieldSnapshot({
    website: "https://verein.de",
    clubType: "youth-academy",
    alternativePhone: "+49 170 1234567",
  });
  assert(all.website === "https://verein.de", "E: website mapped");
  assert(all.club_type === "youth-academy", "E: clubType mapped");
  assert(all.alternative_phone === "+49 170 1234567", "E: alternativePhone mapped");

  // F) normalization
  assert(optionalApplicationText("   ") === null, "F: whitespace-only becomes null");
  assert(normalizeClubType("invalid") === null, "F: invalid clubType becomes null");

  // G) guest flow unchanged at RPC boundary
  assert(
    actions.includes("await supabase.rpc(\"create_guest_application\""),
    "G: guest flow still uses create_guest_application RPC",
  );

  // H) club flow still uses applications insert
  assert(
    actions.includes('.from("applications")'),
    "H: club flow still inserts applications",
  );

  // I) duplicate protection unchanged
  assert(
    actions.includes("existingApplication"),
    "I: duplicate pre-check remains",
  );
  assert(
    actions.includes("isDuplicateTeamApplicationViolation"),
    "I: duplicate unique violation handling remains",
  );

  // J) mail/idempotency untouched
  const receivedMail = readFileSync(
    join(process.cwd(), "src/lib/email/received-mail.ts"),
    "utf8",
  );
  const statusMail = readFileSync(
    join(process.cwd(), "src/lib/email/status-mail.ts"),
    "utf8",
  );
  assert(
    !receivedMail.includes("guestApplicationFieldSnapshot"),
    "J: received mail flow unchanged",
  );
  assert(
    statusMail.includes("reserve_application_status_email_send"),
    "J: status mail idempotency remains",
  );

  return "ok";
}
