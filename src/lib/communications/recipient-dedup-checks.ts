import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deduplicateRecipientsByEmail,
  normalizeRecipientEmail,
  summarizeRecipientPreview,
} from "@/lib/communications/recipient-picker";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831230000_communication_recipient_email_dedup.sql",
    ),
    "utf8",
  );
}

function readMail() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
}

function readC1Migration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260830120000_communication_center.sql"),
    "utf8",
  );
}

export function runCommunicationRecipientDedupChecks() {
  const migration = readMigration();
  const mail = readMail();
  const c1 = readC1Migration();

  assert(
    migration.includes("CREATE OR REPLACE FUNCTION public.resolve_communication_recipients"),
    "resolve_communication_recipients replaced",
  );
  assert(
    migration.includes("DISTINCT ON (lower(btrim(a.contact_email)))"),
    "email dedup via DISTINCT ON lower(trim)",
  );
  assert(
    migration.includes("lower(btrim(a.contact_email))"),
    "recipient_email normalized to lower(trim)",
  );
  assert(
    migration.includes("array_position(p_application_ids, a.id)"),
    "custom selection keeps first selected application per email",
  );
  assert(
    !migration.includes("is_admin()"),
    "dedup migration does not add is_admin bypass",
  );
  assert(
    !migration.includes("GRANT EXECUTE") && !migration.includes("TO anon"),
    "no new anon grants",
  );

  assert(
    c1.includes("FROM public.resolve_communication_recipients") &&
      mail.includes("initiate_communication_send"),
    "C1 flow uses resolve via initiate_communication_send",
  );
  assert(
    mail.includes("for (const recipient of recipients"),
    "one email send per communication_recipient row",
  );
  assert(
    !mail.includes("deduplicate") && !mail.includes("uniqueEmail"),
    "dedup belongs in SQL resolver not parallel mail logic",
  );

  assert(normalizeRecipientEmail("  Test@Example.com  ") === "test@example.com", "normalize trim+lower");
  assert(normalizeRecipientEmail("test@example.com") === "test@example.com", "normalize stable");

  const deduped = deduplicateRecipientsByEmail([
    {
      applicationId: "a-1",
      teamDirectoryEntryId: null,
      recipientEmail: "Test@example.com",
      recipientTeamName: "Team A",
      recipientClubName: "Club A",
    },
    {
      applicationId: "a-2",
      teamDirectoryEntryId: null,
      recipientEmail: "test@example.com",
      recipientTeamName: "Team B",
      recipientClubName: "Club B",
    },
  ]);
  assert(deduped.length === 1, "client preview dedup case-insensitive");

  const summary = summarizeRecipientPreview(
    deduped,
    2,
  );
  assert(summary.teamCount === 2, "selected team count preserved");
  assert(summary.uniqueEmailCount === 1, "unique email count matches server dedup");
  assert(summary.actualRecipientCount === 1, "actual recipient count matches preview");

  const twoUnique = summarizeRecipientPreview(
    [
      {
        applicationId: "a-1",
      teamDirectoryEntryId: null,
        recipientEmail: "one@example.com",
        recipientTeamName: "Team A",
        recipientClubName: null,
      },
      {
        applicationId: "a-2",
      teamDirectoryEntryId: null,
        recipientEmail: "two@example.com",
        recipientTeamName: "Team B",
        recipientClubName: null,
      },
    ],
    2,
  );
  assert(twoUnique.actualRecipientCount === 2, "two distinct emails => two recipients");
  assert(twoUnique.uniqueEmailCount === 2, "preview count equals recipient count");

  const oneRecipient = summarizeRecipientPreview(
    [
      {
        applicationId: "a-1",
      teamDirectoryEntryId: null,
        recipientEmail: "solo@example.com",
        recipientTeamName: "Team A",
        recipientClubName: null,
      },
    ],
    1,
  );
  assert(oneRecipient.actualRecipientCount === 1, "single application => single recipient");

  return "ok";
}
