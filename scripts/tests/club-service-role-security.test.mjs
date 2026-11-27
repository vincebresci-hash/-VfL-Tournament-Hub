import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(rel) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("the service-role club query is gated, server-only and leaks nothing sensitive", () => {
  const actions = read("src/lib/db/club-assignment-actions.ts");
  const serviceRole = read("src/lib/supabase/service-role.ts");
  const schedulePage = read("src/app/admin/turniere/[id]/spielplan/page.tsx");
  const assignmentPanel = read("src/components/admin/ClubAssignmentPanel.tsx");

  // Server action boundary — never bundled into the client.
  assert.ok(actions.trimStart().startsWith('"use server"'), "club actions must be a server module");
  assert.ok(serviceRole.includes('import "server-only"'), "service role client must be server-only");

  // Both exported entry points enforce the schedule.manage permission.
  // The only service-role reader is the private readAllClubs helper; it is not
  // exported and every entry point gates before touching club data.
  assert.ok(!actions.includes("export async function readAllClubs"), "readAllClubs must stay private");
  const listBody = actions.slice(actions.indexOf("export async function listAssignableClubOptions"), actions.indexOf("export type CreateClubResult"));
  const createBody = actions.slice(actions.indexOf("export async function createAssignableClubAction"));
  for (const [name, body] of [["list", listBody], ["create", createBody]]) {
    assert.ok(body.includes("requireScheduleManage()"), `${name} must call requireScheduleManage()`);
    assert.ok(body.includes("access.error"), `${name} must fail closed on a permission error`);
    const gateAt = body.indexOf("requireScheduleManage()");
    const firstReadAt = Math.min(
      ...["readAllClubs(", "createServiceRoleClient"].map((token) => {
        const i = body.indexOf(token);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    assert.ok(gateAt >= 0 && gateAt < firstReadAt, `${name} must check permission before any club access`);
  }

  // Only non-sensitive columns are read — never select("*") / contact columns.
  assert.ok(actions.includes('select("id, name, city")'), "club read must be limited to id/name/city");
  assert.ok(!actions.includes('select("*")'), "club read must not select all columns");
  assert.ok(!/contact_|email|phone|created_by.*select/i.test(actions), "no sensitive columns in the club read");

  // The service-role key is never referenced in the actions file directly.
  assert.ok(!actions.includes("SERVICE_ROLE_KEY"), "actions must not touch the service role key directly");

  // Missing Preview configuration must fail closed without replacing the
  // privileged lookup with an RLS-bypassing browser/anon client.
  assert.ok(
    actions.includes("createServiceRoleClientIfConfigured"),
    "club actions must use the optional server-only service-role helper",
  );
  assert.ok(actions.includes("CLUB_DIRECTORY_UNAVAILABLE"), "missing config must return a controlled error");
  assert.ok(!actions.includes("createBrowserClient"), "club actions must never fall back to a browser client");
  assert.ok(
    serviceRole.includes("if (!process.env.SUPABASE_SERVICE_ROLE_KEY)") && serviceRole.includes("return null"),
    "optional helper must return null when the key is unavailable",
  );
  assert.ok(schedulePage.includes("clubDirectoryError={clubOptions.error}"), "page must pass the controlled state to the UI");
  assert.ok(
    assignmentPanel.includes("Vereinszuordnung in der Teilnehmerverwaltung öffnen"),
    "the controlled state must provide a safe assignment path",
  );
});
