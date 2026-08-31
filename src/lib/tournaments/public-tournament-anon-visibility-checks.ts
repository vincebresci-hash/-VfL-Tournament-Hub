import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration(name: string) {
  return readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
}

export function runPublicTournamentAnonVisibilityChecks() {
  const rbacMigration = readMigration("20260831210000_rbac_domain_rls_enforcement.sql");
  const hotfixMigration = readMigration(
    "20260831260000_public_tournament_anon_visibility.sql",
  );

  // A) anon can execute the required visibility helper
  assert(
    hotfixMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.can_view_archived_tournament(timestamptz) TO anon",
    ),
    "A: hotfix grants anon EXECUTE on can_view_archived_tournament",
  );
  assert(
    rbacMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.can_view_archived_tournament(timestamptz) TO authenticated",
    ),
    "A: authenticated EXECUTE grant remains in RBAC migration",
  );

  // B) anon can see normal public non-archived tournaments (policy + function logic)
  assert(
    rbacMigration.includes("CREATE POLICY tournaments_select_public"),
    "B: tournaments_select_public policy exists",
  );
  assert(
    rbacMigration.includes("TO anon, authenticated"),
    "B: tournaments_select_public applies to anon",
  );
  assert(
    rbacMigration.includes("USING (public.can_view_archived_tournament(archived_at))"),
    "B: policy uses can_view_archived_tournament",
  );
  assert(
    rbacMigration.includes("SELECT p_archived_at IS NULL OR public.has_rbac_permission('tournaments.view')"),
    "B: non-archived tournaments visible when archived_at IS NULL",
  );

  // C) anon cannot gain unintended access to archived tournaments
  assert(
    rbacMigration.includes("REVOKE ALL ON FUNCTION public.has_rbac_permission(text, uuid, uuid) FROM PUBLIC"),
    "C: has_rbac_permission revoked from PUBLIC",
  );
  assert(
    !rbacMigration.includes("GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text, uuid, uuid) TO anon"),
    "C: has_rbac_permission not granted to anon",
  );
  assert(
    rbacMigration.includes("IF v_user_id IS NULL THEN\n    RETURN false"),
    "C: has_rbac_permission returns false without auth.uid()",
  );

  // D) authenticated/admin behavior unchanged
  assert(
    rbacMigration.includes("CREATE OR REPLACE FUNCTION public.can_view_archived_tournament"),
    "D: visibility helper unchanged by hotfix",
  );
  assert(
    !hotfixMigration.includes("CREATE OR REPLACE FUNCTION public.can_view_archived_tournament"),
    "D: hotfix does not replace visibility helper",
  );
  assert(
    !hotfixMigration.includes("DROP POLICY"),
    "D: hotfix does not change RLS policies",
  );

  // E) no write permissions added
  assert(
    !hotfixMigration.toLowerCase().includes("insert"),
    "E: hotfix does not mention INSERT",
  );
  assert(
    !hotfixMigration.toLowerCase().includes("update"),
    "E: hotfix does not mention UPDATE",
  );
  assert(
    !hotfixMigration.toLowerCase().includes("delete"),
    "E: hotfix does not mention DELETE",
  );
  assert(
    rbacMigration.includes("has_rbac_permission('tournaments.manage')"),
    "E: write path still requires tournaments.manage",
  );

  // Related anon SELECT policies share the same helper; one grant covers them.
  const relatedPolicies = [
    "tournament_groups_select_public",
    "tournament_group_members_select_public",
    "tournament_matches_select_public",
    "tournament_external_teams_select_public",
  ];
  for (const policy of relatedPolicies) {
    assert(
      rbacMigration.includes(policy),
      `related policy ${policy} uses shared visibility helper`,
    );
    assert(
      rbacMigration.includes("public.can_view_archived_tournament(tournaments.archived_at)"),
      `related policy ${policy} references can_view_archived_tournament`,
    );
  }

  assert(
    !hotfixMigration.includes("GRANT EXECUTE ON FUNCTION public.has_rbac_permission"),
    "no broadened has_rbac_permission grant in hotfix",
  );

  return "ok";
}
