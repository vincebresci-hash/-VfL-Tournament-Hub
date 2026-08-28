import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DUPLICATE_TEAM_APPLICATION_MESSAGE,
  hasExistingTeamApplication,
  isDuplicateTeamApplicationViolation,
  resolveDuplicateTeamApplicationResult,
} from "@/lib/applications/duplicate-team-application";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260828100000_prevent_duplicate_team_applications.sql",
    ),
    "utf8",
  );
}

function readActionsSource() {
  return readFileSync(join(process.cwd(), "src/lib/applications/actions.ts"), "utf8");
}

export function runDuplicateApplicationChecks() {
  const migration = readMigration();
  const actions = readActionsSource();

  // DB protection
  assert(
    migration.includes("applications_tournament_team_unique_idx"),
    "migration must create applications_tournament_team_unique_idx",
  );
  assert(
    migration.includes("ON public.applications (tournament_id, team_id)"),
    "migration must index tournament_id and team_id",
  );
  assert(
    migration.includes("WHERE team_id IS NOT NULL"),
    "migration must be partial for guest applications",
  );

  // App-layer pre-check + unique violation handling
  assert(
    actions.includes("DUPLICATE_TEAM_APPLICATION_MESSAGE"),
    "club submit must use duplicate message constant",
  );
  assert(
    actions.includes('.eq("tournament_id", tournamentId)'),
    "pre-check must scope by tournament_id",
  );
  assert(
    actions.includes('.eq("team_id", teamId)'),
    "pre-check must scope by team_id",
  );
  assert(
    !actions.includes('.eq("status"'),
    "pre-check must not filter by status",
  );
  assert(
    actions.includes("isDuplicateTeamApplicationViolation"),
    "insert must handle unique violation race condition",
  );
  assert(
    actions.includes("submitGuestApplication"),
    "guest submission path must remain",
  );
  assert(
    actions.includes('create_guest_application'),
    "guest RPC path must remain",
  );

  // A) first application passes
  assert(
    !resolveDuplicateTeamApplicationResult({ existingApplicationId: null }).blocked,
    "A: first application is not blocked",
  );

  // B) second application blocked
  assert(
    resolveDuplicateTeamApplicationResult({ existingApplicationId: "app-1" }).blocked,
    "B: duplicate application is blocked",
  );
  assert(
    resolveDuplicateTeamApplicationResult({ existingApplicationId: "app-1" }).error ===
      DUPLICATE_TEAM_APPLICATION_MESSAGE,
    "B: duplicate message is user-facing German",
  );

  // C) different team passes
  assert(
    !resolveDuplicateTeamApplicationResult({ existingApplicationId: null }).blocked,
    "C: different team is not blocked by helper",
  );

  // D) different tournament passes
  assert(
    !resolveDuplicateTeamApplicationResult({ existingApplicationId: null }).blocked,
    "D: different tournament is not blocked by helper",
  );

  // E) rejected existing application still blocks
  assert(
    hasExistingTeamApplication("rejected-app"),
    "E: existing application blocks regardless of status",
  );

  // F) parallel insert race handled by unique violation
  assert(
    isDuplicateTeamApplicationViolation({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "applications_tournament_team_unique_idx"',
    }),
    "F: unique violation on index is detected",
  );
  assert(
    resolveDuplicateTeamApplicationResult({
      insertError: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "applications_tournament_team_unique_idx"',
      },
    }).blocked,
    "F: race insert resolves to blocked duplicate",
  );

  // G) guest applications unaffected (team_id NULL excluded from index)
  assert(
    migration.includes("WHERE team_id IS NOT NULL"),
    "G: partial index excludes guest applications",
  );

  // H) blocked duplicate must not proceed to email send
  const errorReturnIndex = actions.indexOf("if (result.error) {");
  const emailSendIndex = actions.indexOf("await sendApplicationReceivedEmail");
  assert(errorReturnIndex !== -1, "submit action must handle result.error");
  assert(emailSendIndex !== -1, "submit action must send received email on success");
  assert(
    errorReturnIndex < emailSendIndex,
    "email send must happen only after duplicate/error early return",
  );

  return "ok";
}
