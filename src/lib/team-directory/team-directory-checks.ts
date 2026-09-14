import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDirectoryNormalization,
  normalizeDirectoryEmail,
  normalizeDirectoryText,
} from "@/lib/team-directory/normalize";
import { canSeeAdminNavItem } from "@/lib/rbac/admin-access";
import {
  buildTeamDirectoryLogoObjectPath,
  isTeamDirectoryManagedLogoUrl,
  teamDirectoryLogoPathPrefix,
} from "@/lib/storage/club-logos";

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
  assert(
    (migration.match(/REFERENCES/g) ?? []).length === 5,
    "five foreign keys on team_directory_entries",
  );

  const verifyScript = readRepoFile("supabase/scripts/pr36_team_directory_post_migration_verify.sql");
  assert(
    verifyScript.includes("team_directory_foreign_key_count_is_5"),
    "post-migration verify checks five foreign keys",
  );
  assert(
    verifyScript.includes("has_table_privilege('anon', 'public.team_directory_entries'"),
    "post-migration verify uses has_table_privilege for anon",
  );

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

  const entryId = "11111111-1111-1111-1111-111111111111";
  const managedPath = buildTeamDirectoryLogoObjectPath({
    entryId,
    mimeType: "image/png",
  });
  assert(
    managedPath.startsWith(teamDirectoryLogoPathPrefix(entryId)),
    "team directory logo path uses entry prefix",
  );
  assert(
    managedPath.startsWith("team-directory/") && managedPath.endsWith(".png"),
    "team directory logo path shape",
  );
  assert(
    isTeamDirectoryManagedLogoUrl(
      `https://example.supabase.co/storage/v1/object/public/club-logos/${managedPath}`,
      entryId,
    ),
    "managed team-directory logo url accepted",
  );
  assert(
    !isTeamDirectoryManagedLogoUrl(
      `https://example.supabase.co/storage/v1/object/public/club-logos/tournaments/t1/applications/a1/x.png`,
      entryId,
    ),
    "foreign application logo path rejected",
  );
  assert(
    !isTeamDirectoryManagedLogoUrl(
      `https://example.supabase.co/storage/v1/object/public/club-logos/team-directory/other-id/x.png`,
      entryId,
    ),
    "other entry logo path rejected",
  );

  assert(actions.includes("saveTeamDirectoryEntryAction"), "save action");
  assert(actions.includes("updateTeamDirectoryEntryAction"), "update action");
  assert(actions.includes("setTeamDirectoryArchivedAction"), "archive action");
  assert(actions.includes("updateTeamDirectoryLogoAction"), "logo action");
  assert(actions.includes("uploadTeamDirectoryLogoFormAction"), "logo form action");
  assert(actions.includes("deleteTeamDirectoryEntryAction"), "hard delete action");
  assert(actions.includes("requirePlatformTeamsManage"), "platform manage guard");
  assert(actions.includes("buildTeamDirectoryLogoObjectPath"), "server-built logo path");
  assert(actions.includes("requiredPathPrefix"), "storage delete prefix guard");
  assert(actions.includes("teamDirectoryLogoPathPrefix"), "team-directory path prefix");
  assert(
    actions.includes('.from("team_directory_entries")') && actions.includes(".delete()"),
    "hard delete targets team_directory_entries only",
  );
  assert(!actions.includes('.from("applications").delete'), "applications not hard-deleted");
  assert(!actions.includes('.from("clubs").delete'), "clubs not hard-deleted");
  assert(!actions.includes('.from("teams").delete'), "teams not hard-deleted");
  assert(!actions.includes("applications.logo_url"), "does not write applications.logo_url");
  assert(!actions.includes("tournament_external_teams"), "does not touch external team logos");
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

  const logoDeleteMigration = readRepoFile(
    "supabase/migrations/20260914180000_team_directory_logo_hard_delete.sql",
  );
  assert(
    logoDeleteMigration.includes("ADD COLUMN IF NOT EXISTS logo_url text NULL"),
    "additive logo_url column",
  );
  assert(
    logoDeleteMigration.includes("team_directory_entries_delete"),
    "delete RLS policy",
  );
  assert(
    logoDeleteMigration.includes("has_platform_rbac_access()") &&
      logoDeleteMigration.includes("has_rbac_permission('teams.manage')"),
    "delete policy requires platform + teams.manage",
  );
  assert(
    logoDeleteMigration.includes("GRANT DELETE ON TABLE public.team_directory_entries TO authenticated"),
    "delete grant for authenticated",
  );
  assert(!logoDeleteMigration.includes("TO anon"), "no anon delete grant");
  assert(!logoDeleteMigration.includes("GRANT DELETE") || !logoDeleteMigration.includes("TO PUBLIC"), "no public delete");
  assert(!logoDeleteMigration.includes("service_role"), "no service_role workaround");
  assert(!logoDeleteMigration.includes("ON DELETE CASCADE"), "no cascade changes");
  assert(!logoDeleteMigration.includes("DROP TRIGGER"), "no trigger changes");
  assert(!logoDeleteMigration.includes("applications"), "migration does not touch applications");
  assert(
    !logoDeleteMigration.includes("tournament_external_teams"),
    "migration does not touch external teams",
  );
  assert(
    !logoDeleteMigration.includes("get_application_hard_delete_dependency_counts"),
    "PR52/53 delete guard untouched",
  );

  const storage = readRepoFile("src/lib/storage/club-logos.ts");
  assert(storage.includes("buildTeamDirectoryLogoObjectPath"), "team directory path builder");
  assert(
    storage.includes("`team-directory/${input.entryId}/"),
    "team-directory storage path prefix",
  );
  assert(storage.includes("requiredPathPrefix"), "prefix-guarded storage delete");
  assert(storage.includes("buildApplicationLogoObjectPath"), "PR55 application path preserved");
  assert(storage.includes("buildExternalTeamLogoObjectPath"), "external team path preserved");

  const detailView = readRepoFile("src/components/admin/TeamDirectoryDetailView.tsx");
  assert(detailView.includes("TeamDirectoryLogoEditor"), "logo editor on detail");
  assert(detailView.includes("setTeamDirectoryArchivedAction"), "archive action retained");
  assert(detailView.includes("deleteTeamDirectoryEntryAction"), "hard delete wired");
  assert(
    detailView.includes("Dieser Vorgang löscht nur den Eintrag aus der Team-Datenbank.") &&
      detailView.includes("Bewerbungen,") &&
      detailView.includes("Turnierteilnahmen, Spiele und andere Turnierdaten bleiben erhalten."),
    "hard delete confirmation copy",
  );
  assert(detailView.includes("Endgültig löschen"), "hard delete button label");
  assert(detailView.includes("Reaktivieren"), "restore retained");
  assert(detailView.includes("Archivieren"), "archive retained");

  const board = readRepoFile("src/components/admin/TeamDirectoryBoard.tsx");
  assert(board.includes('"active" | "archived" | "all"'), "archive filters retained");

  const applicationLogoMigration = readRepoFile(
    "supabase/migrations/20260913200000_application_participant_logos.sql",
  );
  assert(
    applicationLogoMigration.includes("applications.logo_manual_override"),
    "PR55 application logo migration preserved",
  );

  const applicationDeleteGuard = readRepoFile(
    "supabase/migrations/20260911153000_application_hard_delete_dependency_counts_rpc.sql",
  );
  assert(
    applicationDeleteGuard.includes("get_application_hard_delete_dependency_counts"),
    "PR53 hard delete RPC preserved",
  );

  assert(queries.includes("findTeamDirectoryDuplicates"), "duplicate detection query");
  assert(queries.includes("findActiveTeamDirectoryEntryBySourceApplication"), "source application lookup");
  assert(queries.includes("logo_url"), "queries select logo_url");
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

  const adminNavigation = readRepoFile("src/lib/admin-navigation.ts");
  assert(adminNavigation.includes('href: "/admin/team-datenbank"'), "team directory sidebar route");
  assert(adminNavigation.includes('label: "Team-Datenbank"'), "team directory sidebar label");
  assert(adminNavigation.includes('href: "/admin/teams"'), "operational teams sidebar route preserved");
  assert(
    canSeeAdminNavItem("/admin/team-datenbank", new Set(["teams.view"]), false),
    "teams.view can see team directory nav item",
  );
  assert(
    !canSeeAdminNavItem("/admin/team-datenbank", new Set(["applications.view"]), false),
    "without teams.view team directory nav item hidden",
  );
  assert(
    canSeeAdminNavItem("/admin/teams", new Set(["teams.view"]), false),
    "teams.view still sees operational teams nav item",
  );

  assert(dedupMigration.includes("DISTINCT ON (lower(btrim(a.contact_email)))"), "PR34 dedup unchanged");
  assert(!migration.includes("resolve_communication_recipients"), "recipient resolver untouched");

  return "ok";
}
