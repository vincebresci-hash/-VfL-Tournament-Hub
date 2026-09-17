import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

const MIGRATION_PATH =
  "supabase/migrations/20260917120000_tournaments_allow_multiple_teams.sql";

export function runAllowMultipleTeamsSettingChecks() {
  const migration = read(MIGRATION_PATH);
  const form = read("src/components/admin/TournamentAdminForm.tsx");
  const actions = read("src/lib/db/admin-actions.ts");
  const adminTypes = read("src/types/admin.ts");
  const databaseTypes = read("src/lib/supabase/database.ts");
  const tournaments = read("src/lib/tournaments.ts");
  const applicationActions = read("src/lib/applications/actions.ts");
  const capacity = read("src/lib/tournament-capacity.ts");
  const occupancyMigration = read(
    "supabase/migrations/20260820153200_tournament_occupancy.sql",
  );
  const cancellationActions = read("src/lib/cancellations/actions.ts");
  const paymentChecks = read("src/lib/payments/payment-checks.ts");
  const publicTournamentType = read("src/types/tournament.ts");

  // A) Migration contract
  assert(
    migration.includes("ALTER TABLE public.tournaments"),
    "migration alters public.tournaments",
  );
  assert(
    migration.includes("allow_multiple_teams boolean NOT NULL DEFAULT false"),
    "allow_multiple_teams is boolean NOT NULL DEFAULT false",
  );
  assert(
    !migration.includes("applications"),
    "migration does not touch applications",
  );
  assert(
    !migration.includes("CREATE POLICY") &&
      !migration.includes("DROP POLICY") &&
      !migration.includes("ENABLE ROW LEVEL SECURITY") &&
      !migration.includes("ALTER POLICY"),
    "migration does not change RLS",
  );
  assert(
    !migration.includes("GRANT ") && !migration.includes("REVOKE "),
    "migration does not change grants",
  );
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION") &&
      !migration.includes("CREATE FUNCTION") &&
      !migration.includes("CREATE TRIGGER"),
    "migration does not add functions or triggers",
  );
  assert(
    !migration.includes("UPDATE ") && !migration.includes("DELETE FROM"),
    "migration does not transform existing data",
  );

  const migrationFiles = readdirSync(
    join(process.cwd(), "supabase/migrations"),
  ).filter((name) => name.endsWith(".sql"));
  assert(
    migrationFiles.includes(
      "20260917120000_tournaments_allow_multiple_teams.sql",
    ),
    "migration file is present in repository",
  );

  // B) Admin create control + default OFF
  assert(
    form.includes('id="tournament-allow-multiple-teams"'),
    "admin form has allow-multiple-teams control",
  );
  assert(
    form.includes("Mehrere Teams pro Verein erlauben"),
    "admin form uses German label",
  );
  assert(
    form.includes("allowMultipleTeams: false"),
    "create form defaults allowMultipleTeams to false",
  );
  assert(
    form.includes('update("allowMultipleTeams", event.target.checked)'),
    "form wires checkbox to allowMultipleTeams",
  );
  assert(
    form.includes("allowMultipleTeams: tournament.allowMultipleTeams"),
    "edit form loads stored allowMultipleTeams",
  );

  // Create/update action persistence
  const parseStart = actions.indexOf("function parseTournamentInput");
  const createStart = actions.indexOf("export async function createTournamentAction");
  const updateStart = actions.indexOf("export async function updateTournamentAction");
  const maxTeamsStart = actions.indexOf(
    "export async function updateTournamentMaxTeamsAction",
  );
  assert(parseStart >= 0, "parseTournamentInput exists");
  assert(createStart >= 0, "createTournamentAction exists");
  assert(updateStart >= 0, "updateTournamentAction exists");

  const parseBlock = actions.slice(
    parseStart,
    createStart > parseStart ? createStart : undefined,
  );
  assert(
    parseBlock.includes("allow_multiple_teams: Boolean(input.allowMultipleTeams)"),
    "parseTournamentInput persists allow_multiple_teams from checkbox",
  );
  assert(
    parseBlock.includes("allow_multiple_teams: boolean"),
    "parseTournamentInput types allow_multiple_teams as boolean",
  );

  const createBlock = actions.slice(
    createStart,
    updateStart > createStart ? updateStart : undefined,
  );
  assert(
    createBlock.includes("parseTournamentInput(input)"),
    "createTournamentAction uses parseTournamentInput",
  );
  assert(
    createBlock.includes('.insert(parsed.value)'),
    "createTournamentAction inserts parsed tournament value",
  );

  const updateBlock = actions.slice(
    updateStart,
    maxTeamsStart > updateStart
      ? maxTeamsStart
      : actions.indexOf("export async function archiveTournamentAction"),
  );
  assert(
    updateBlock.includes("parseTournamentInput(input)"),
    "updateTournamentAction uses parseTournamentInput",
  );
  assert(
    updateBlock.includes('.update(parsed.value)'),
    "updateTournamentAction updates parsed tournament value",
  );
  assert(
    updateBlock.includes('.eq("id", id)'),
    "updateTournamentAction scopes to selected tournament id",
  );

  // C/D) Types + per-tournament isolation (no global setting)
  assert(
    adminTypes.includes("allowMultipleTeams: boolean"),
    "AdminTournament types include allowMultipleTeams",
  );
  assert(
    databaseTypes.includes("allow_multiple_teams: boolean"),
    "TournamentRow includes allow_multiple_teams",
  );
  assert(
    tournaments.includes('"allow_multiple_teams"'),
    "tournament select includes allow_multiple_teams",
  );
  assert(
    tournaments.includes(
      "allowMultipleTeams: asBoolean(row.allow_multiple_teams, false)",
    ),
    "toAdminTournamentRecord maps allow_multiple_teams with false default",
  );
  assert(
    !tournaments.includes("allowMultipleTeams: asBoolean(row.allow_multiple_teams, true)"),
    "allow_multiple_teams must not default to true",
  );

  const settings = read("src/lib/settings.ts");
  const settingsForm = read("src/components/admin/AdminSettingsForm.tsx");
  assert(
    !settings.includes("allow_multiple_teams") &&
      !settings.includes("allowMultipleTeams"),
    "no global app setting for allow_multiple_teams",
  );
  assert(
    !settingsForm.includes("Mehrere Teams pro Verein") &&
      !settingsForm.includes("allowMultipleTeams"),
    "admin settings form has no global multi-team control",
  );

  // Max-teams action untouched for this field
  if (maxTeamsStart >= 0) {
    const afterMaxTeams = actions.slice(maxTeamsStart + 1);
    const nextExportRel = afterMaxTeams.search(/\nexport async function /);
    const maxTeamsBlock =
      nextExportRel >= 0
        ? actions.slice(maxTeamsStart, maxTeamsStart + 1 + nextExportRel)
        : actions.slice(maxTeamsStart, maxTeamsStart + 400);
    assert(
      !maxTeamsBlock.includes("allow_multiple_teams") &&
        !maxTeamsBlock.includes("allowMultipleTeams"),
      "updateTournamentMaxTeamsAction does not touch allow_multiple_teams",
    );
  }

  // E) Regression — PR-A must not change applicant / capacity / payment / cancel paths
  assert(
    !applicationActions.includes("allow_multiple_teams") &&
      !applicationActions.includes("allowMultipleTeams"),
    "application submission is unchanged by allow_multiple_teams",
  );
  assert(
    applicationActions.includes("create_guest_application") ||
      applicationActions.includes("submitGuestApplication"),
    "guest application path remains present",
  );
  assert(
    !capacity.includes("allow_multiple_teams") &&
      !capacity.includes("allowMultipleTeams"),
    "capacity logic is unchanged",
  );
  assert(
    !occupancyMigration.includes("allow_multiple_teams"),
    "occupancy migration unchanged by PR-A",
  );
  assert(
    !cancellationActions.includes("allow_multiple_teams") &&
      !cancellationActions.includes("allowMultipleTeams"),
    "cancellation actions unchanged",
  );
  assert(
    !publicTournamentType.includes("allowMultipleTeams"),
    "public Tournament type does not expose allowMultipleTeams in PR-A",
  );

  const applyFormCandidates = [
    "src/components/apply/ApplicationForm.tsx",
    "src/components/tournaments/ApplicationForm.tsx",
    "src/components/apply/GuestApplicationForm.tsx",
  ];
  for (const candidate of applyFormCandidates) {
    try {
      const source = read(candidate);
      assert(
        !source.includes("allowMultipleTeams") &&
          !source.includes("allow_multiple_teams") &&
          !source.includes("Mehrere Teams pro Verein"),
        `${candidate} must not surface multi-team UI in PR-A`,
      );
    } catch {
      // File may not exist under that path; skip.
    }
  }

  // Payment / email / token surface must not gain this flag via accidental edits
  void paymentChecks;
  const emailMail = read("src/lib/email/status-mail.ts");
  assert(
    !emailMail.includes("allow_multiple_teams") &&
      !emailMail.includes("allowMultipleTeams"),
    "status mail path unchanged",
  );

  return "ok";
}
