import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDirectoryNormalization,
  normalizeDirectoryEmail,
  normalizeDirectoryText,
} from "@/lib/team-directory/normalize";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

export function runTeamDirectoryChecks() {
  const migration = readRepoFile("supabase/migrations/20260831240000_team_directory.sql");
  const actions = readRepoFile("src/lib/team-directory/actions.ts");
  const queries = readRepoFile("src/lib/team-directory/queries.ts");
  const access = readRepoFile("src/lib/team-directory/access.ts");
  const applicationDetail = readRepoFile("src/components/admin/ApplicationDetail.tsx");
  const dedupMigration = readRepoFile(
    "supabase/migrations/20260831230000_communication_recipient_email_dedup.sql",
  );

  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.team_directory_entries"), "team directory table");
  assert(migration.includes("team_directory_source"), "team directory source enum");
  assert(migration.includes("norm_club_name"), "normalized club name column");
  assert(migration.includes("norm_team_name"), "normalized team name column");
  assert(migration.includes("archived_at"), "archive support");
  assert(migration.includes("has_platform_rbac_access()"), "platform-only RLS gate");
  assert(migration.includes("has_rbac_permission('teams.view')"), "teams.view read policy");
  assert(migration.includes("has_rbac_permission('teams.manage')"), "teams.manage write policy");
  assert(!migration.includes("TO anon"), "no anon grants on team directory");
  assert(migration.includes("team_directory_entries_active_source_application_uidx"), "active source application unique index");
  assert(
    migration.includes("UNIQUE") && migration.includes("source_application_id") && migration.includes("archived_at IS NULL"),
    "one active entry per source application",
  );
  assert(!migration.includes("team_directory_entries_source_application_idx"), "non-unique source application index replaced");

  assert(normalizeDirectoryText("  VfL Kirchheim  ") === "vfl kirchheim", "normalize text");
  assert(normalizeDirectoryEmail("  Test@Mail.DE ") === "test@mail.de", "normalize email");
  assert(
    buildDirectoryNormalization({
      clubName: "SV Test",
      teamName: "U13",
      ageGroup: "U13",
    }).normClubName === "sv test",
    "build normalization",
  );

  assert(actions.includes("saveTeamDirectoryEntryAction"), "save action");
  assert(actions.includes("updateTeamDirectoryEntryAction"), "update action");
  assert(actions.includes("setTeamDirectoryArchivedAction"), "archive action");
  assert(actions.includes("requirePlatformTeamsManage"), "platform manage guard");
  assert(actions.includes("forceCreate"), "force create duplicate override");
  assert(
    !actions.includes("excludeId: input.forceCreate ? undefined : undefined"),
    "save action has no dead excludeId ternary",
  );
  assert(
    actions.includes("excludeId: entryId"),
    "update action excludes current entry from duplicate detection",
  );
  assert(!actions.includes(".update(applications"), "applications not mutated on save");
  assert(!actions.includes("updateApplicationStatus"), "no status changes");

  assert(queries.includes("findTeamDirectoryDuplicates"), "duplicate detection query");
  assert(queries.includes("findActiveTeamDirectoryEntryBySourceApplication"), "source application lookup");
  assert(queries.includes('addMatch(row, "team_id")'), "team_id duplicate reason");
  assert(queries.includes('addMatch(row, "club_team_age")'), "club team age duplicate reason");
  assert(queries.includes('addMatch(row, "normalized_identity")'), "normalized duplicate reason");
  assert(queries.includes('"source_application"'), "source application duplicate reason");
  assert(actions.includes('duplicate.matchReason === "source_application"'), "application duplicate blocks save");
  assert(
    actions.includes("Diese Bewerbung wurde bereits in die Team-Datenbank übernommen."),
    "application duplicate error message",
  );
  assert(queries.includes("loadTeamDirectoryHistory"), "history from applications");
  assert(!queries.includes("team_directory_history"), "no redundant history table");

  assert(access.includes("isPlatformTeamDirectoryUser"), "platform user gate");
  assert(access.includes("requirePlatformTeamDirectoryPage"), "platform page gate");

  assert(applicationDetail.includes("TeamDirectorySavePanel"), "application save panel");
  assert(applicationDetail.includes("In Team-Datenbank übernehmen") === false, "button text in panel component");

  assert(dedupMigration.includes("DISTINCT ON (lower(btrim(a.contact_email)))"), "PR34 dedup unchanged");
  assert(!migration.includes("resolve_communication_recipients"), "recipient resolver untouched");

  return "ok";
}
