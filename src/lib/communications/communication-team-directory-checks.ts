import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allowedCommunicationTypesForSource,
  isTypeAllowedForRecipientSource,
  requiresCustomDirectoryEntryIds,
} from "@/lib/communications/recipient-filters";
import {
  filterVisibleDirectoryEntries,
  isDirectoryEntrySelectable,
  type CommunicationEligibleDirectoryEntry,
} from "@/lib/communications/team-directory-recipient-picker";
import { hasCommunicationTeamDirectoryPermission } from "@/lib/communications/access";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831270000_communication_team_directory_recipients.sql",
    ),
    "utf8",
  );
}

function readVerifyScript() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/scripts/pr_communication_team_directory_post_migration_verify.sql",
    ),
    "utf8",
  );
}

const directoryEntry: CommunicationEligibleDirectoryEntry = {
  id: "dir-1",
  clubName: "Club A",
  teamName: "Team A",
  ageGroup: "U15",
  contactFirstName: "Max",
  contactLastName: "Muster",
  contactRole: null,
  contactEmail: "team-a@example.com",
  contactPhone: null,
  website: null,
  league: "Kreisliga",
  birthYear: 2011,
  division: null,
  selfRatedStrength: null,
  internalCategory: "A",
  internalStrength: 3,
  internalNotes: null,
  source: "manual",
  sourceApplicationId: null,
  clubId: null,
  teamId: null,
  isHubLinked: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export function runCommunicationTeamDirectoryChecks() {
  const migration = readMigration();
  const verifyScript = readVerifyScript();
  const mail = readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
  const actions = readFileSync(
    join(process.cwd(), "src/lib/communications/actions.ts"),
    "utf8",
  );
  const queries = readFileSync(
    join(process.cwd(), "src/lib/communications/queries.ts"),
    "utf8",
  );
  const composeForm = readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationComposeForm.tsx"),
    "utf8",
  );
  const dedupMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831230000_communication_recipient_email_dedup.sql",
    ),
    "utf8",
  );

  assert(migration.includes("recipient_source"), "recipient_source column");
  assert(
    migration.includes("DEFAULT 'tournament-applications'"),
    "recipient_source default",
  );
  assert(
    migration.includes("team_directory_entry_id"),
    "team_directory_entry_id column",
  );
  assert(
    migration.includes("recipient_contact_first_name"),
    "recipient_contact_first_name column",
  );
  assert(
    migration.includes("communication_recipients_communication_application_uidx"),
    "partial unique application index",
  );
  assert(
    migration.includes("communication_recipients_communication_directory_uidx"),
    "partial unique directory index",
  );
  assert(
    migration.includes("DROP CONSTRAINT IF EXISTS communication_recipients_unique_application"),
    "legacy unique constraint dropped",
  );
  assert(
    migration.includes("resolve_team_directory_communication_recipients"),
    "directory resolver",
  );
  assert(
    migration.includes("DISTINCT ON (lower(btrim(tde.contact_email)))"),
    "directory email dedup",
  );
  assert(
    migration.includes("array_position(p_entry_ids, tde.id)"),
    "directory deterministic ordering",
  );
  assert(migration.includes("teams.view required"), "directory resolver teams.view guard");
  assert(
    migration.includes("platform access required"),
    "directory resolver platform guard",
  );
  assert(
    migration.includes("payment reminder not allowed for team-directory source"),
    "payment reminder blocked for directory",
  );
  assert(
    migration.includes("FROM public.resolve_communication_recipients("),
    "application resolver still used for tournament-applications",
  );
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.resolve_communication_recipients"),
    "application resolver not modified",
  );
  assert(
    dedupMigration.includes("CREATE OR REPLACE FUNCTION public.resolve_communication_recipients"),
    "application resolver remains in dedup migration only",
  );

  assert(verifyScript.includes("SELECT/EXISTS only"), "verify script read-only");
  assert(verifyScript.includes("directory_resolver_not_granted_to_anon"), "verify anon guard");

  assert(mail.includes("p_recipient_source"), "mail initiate passes recipient source");
  assert(mail.includes("recipient_contact_first_name"), "mail uses directory contact snapshot");
  assert(mail.includes("loadApplicationContext"), "application context path preserved");

  assert(actions.includes("loadEligibleCommunicationDirectoryEntriesAction"), "directory load action");
  assert(actions.includes("getCommunicationTeamDirectoryAccess"), "directory access gate");
  assert(actions.includes("requireTeamsView"), "directory load requires teams.view");
  assert(actions.includes("paymentReminderDirectoryError"), "directory payment reminder guard");

  assert(queries.includes("p_recipient_source"), "preview query passes recipient source");
  assert(queries.includes("listEligibleDirectoryEntriesForCommunication"), "directory list query");
  assert(queries.includes("recipient_source"), "history includes recipient source");

  assert(composeForm.includes("CommunicationTeamDirectoryRecipientPicker"), "directory picker wired");
  assert(composeForm.includes("team-directory"), "recipient source toggle");
  assert(composeForm.includes("canUseTeamDirectorySource"), "directory source permission gate");

  assert(
    !isTypeAllowedForRecipientSource({
      type: "payment-reminder",
      recipientSource: "team-directory",
    }),
    "payment reminder blocked for directory in app layer",
  );
  assert(
    allowedCommunicationTypesForSource("team-directory").every(
      (type) => type !== "payment-reminder",
    ),
    "payment reminder hidden for directory types",
  );
  assert(requiresCustomDirectoryEntryIds("team-directory"), "directory requires entry ids");

  assert(isDirectoryEntrySelectable(directoryEntry), "directory entry with email selectable");
  assert(
    !isDirectoryEntrySelectable({ ...directoryEntry, contactEmail: "  " }),
    "directory entry without email not selectable",
  );

  const filtered = filterVisibleDirectoryEntries([directoryEntry], {
    search: "",
    clubName: "Club A",
    ageGroup: "all",
    birthYear: "all",
    league: "all",
    internalCategory: "all",
    internalStrength: "all",
    hub: "all",
  });
  assert(filtered.length === 1, "directory club filter");

  assert(
    hasCommunicationTeamDirectoryPermission(
      new Set(["teams.view", "communications.view"]),
      ["COMMUNICATION_MANAGER"],
      "admin",
    ),
    "platform admin with teams.view can use directory source",
  );
  assert(
    !hasCommunicationTeamDirectoryPermission(
      new Set(["communications.view"]),
      ["COMMUNICATION_MANAGER"],
      "admin",
    ),
    "communication manager without teams.view blocked",
  );
  assert(
    !hasCommunicationTeamDirectoryPermission(
      new Set(["teams.view", "communications.view"]),
      ["CLUB_ADMIN"],
      "club",
    ),
    "club admin blocked from platform directory source",
  );

  return "ok";
}
