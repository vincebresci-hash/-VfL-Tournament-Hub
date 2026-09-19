import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RBAC_PERMISSIONS } from "@/types/rbac";
import { ROLE_PERMISSIONS } from "@/lib/rbac/permissions";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-partner-assignment-rpc-checks: ${message}`);
  }
}

export function runTournamentPartnerAssignmentRpcChecks() {
  const migration = read(
    "supabase/migrations/20260919200000_set_tournament_partner_assignments_rpc.sql",
  );
  const phase2a = read(
    "supabase/migrations/20260918210000_tournament_partners_phase2a.sql",
  );
  const partnersV1 = read(
    "supabase/migrations/20260918200000_partners_management_v1.sql",
  );
  const database = read("src/lib/supabase/database.ts");
  const actions = read("src/lib/partners/actions.ts");
  const queries = read("src/lib/partners/queries.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  const tournamentAdminForm = read("src/components/admin/TournamentAdminForm.tsx");
  const tournamentDetail = read("src/app/turniere/[slug]/page.tsx");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerGrid = read("src/components/partners/PartnerLogoGrid.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const rbacTypes = read("src/types/rbac.ts");

  // 1 signature
  assert(
    migration.includes(
      "CREATE OR REPLACE FUNCTION public.set_tournament_partner_assignments(",
    ) &&
      migration.includes("p_tournament_id uuid,") &&
      migration.includes("p_partner_ids uuid[]") &&
      migration.includes("RETURNS uuid[]"),
    "correct RPC name/signature",
  );

  // 2–3 SECURITY DEFINER + search_path
  assert(migration.includes("SECURITY DEFINER"), "SECURITY DEFINER");
  assert(
    migration.includes("SET search_path = public"),
    "locked search_path",
  );

  // 4–5 authz
  assert(
    migration.includes("has_rbac_permission('tournaments.manage')") &&
      migration.includes("Nicht autorisiert."),
    "tournaments.manage authorization",
  );
  assert(
    !/has_rbac_permission\('partners\.manage'\)/.test(migration),
    "no partners.manage requirement",
  );

  // 6–7 tournament validation + lock
  assert(
    migration.includes("Turnier nicht gefunden.") &&
      migration.includes("FROM public.tournaments"),
    "tournament existence validation",
  );
  assert(
    /FROM public\.tournaments AS t[\s\S]*FOR UPDATE/.test(migration) ||
      /FROM public\.tournaments[\s\S]*FOR UPDATE/.test(migration),
    "parent tournament row locking / concurrency serialization",
  );

  // 8–10 partner validation / normalize
  assert(
    migration.includes("Ungültiger Partner.") &&
      migration.includes("LEFT JOIN public.partners"),
    "Partner existence validation",
  );
  assert(
    migration.includes("array_agg(DISTINCT") &&
      migration.includes("unnest(coalesce(p_partner_ids, ARRAY[]::uuid[]))"),
    "submitted IDs deduplicated; NULL handled as empty set",
  );
  assert(
    migration.includes("coalesce(p_partner_ids, ARRAY[]::uuid[])"),
    "NULL handled as empty set",
  );

  // 11–14 active/inactive rules + omission
  assert(
    migration.includes("is_active = false") &&
      migration.includes("NOT (sid.id = ANY (v_existing))") &&
      migration.includes("Inaktive Partner können nicht neu zugeordnet werden."),
    "inactive NEW Partner rejected; inactive EXISTING may remain",
  );
  assert(
    /DELETE FROM public\.tournament_partners[\s\S]*NOT \(tp\.partner_id = ANY \(v_normalized\)\)/.test(
      migration,
    ),
    "omission removes assignment",
  );

  // 15 delete + insert in one RPC
  assert(
    migration.includes("DELETE FROM public.tournament_partners") &&
      migration.includes("INSERT INTO public.tournament_partners") &&
      migration.includes("ON CONFLICT (tournament_id, partner_id) DO NOTHING"),
    "delete + insert replacement occurs inside one RPC",
  );

  // 16 deterministic return
  assert(
    migration.includes("ORDER BY p.sort_order ASC, p.name ASC, p.id ASC") &&
      migration.includes("RETURN ARRAY("),
    "deterministic return",
  );

  // 17–19 grants
  assert(
    /REVOKE ALL ON FUNCTION public\.set_tournament_partner_assignments\(uuid, uuid\[\]\)\s+FROM PUBLIC/.test(
      migration,
    ),
    "PUBLIC execute revoked",
  );
  assert(
    /REVOKE ALL ON FUNCTION public\.set_tournament_partner_assignments\(uuid, uuid\[\]\)\s+FROM anon/.test(
      migration,
    ),
    "anon execute revoked",
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.set_tournament_partner_assignments\(uuid, uuid\[\]\)\s+TO authenticated/.test(
      migration,
    ),
    "authenticated execute granted",
  );

  // 20 no new RBAC permission
  assert(
    !migration.includes("INSERT INTO public.rbac_permissions") &&
      !rbacTypes.includes("tournament_partners") &&
      !RBAC_PERMISSIONS.includes("tournament_partners.manage" as never) &&
      !ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("partners.manage"),
    "no new RBAC permission; TOURNAMENT_MANAGER still without partners.manage",
  );

  // 21 Phase 2A unchanged content presence (separate file)
  assert(
    phase2a.includes("CREATE TABLE IF NOT EXISTS public.tournament_partners") &&
      !phase2a.includes("set_tournament_partner_assignments"),
    "Phase 2A migration unchanged (no RPC inside Phase 2A file)",
  );

  // 22–25 regressions / scope
  assert(
    partnersV1.includes("CREATE TABLE IF NOT EXISTS public.partners") &&
      actions.includes("requirePartnersManage") &&
      actions.includes("updatePartnerLogoAction") &&
      !actions.includes("set_tournament_partner_assignments"),
    "no Partner V1 regression",
  );
  assert(
    adminActions.includes("createTournamentAction") &&
      adminActions.includes("updateTournamentAction") &&
      !adminActions.includes("set_tournament_partner_assignments") &&
      !adminActions.includes("tournament_partners"),
    "no tournament create/update changes",
  );
  assert(
    !tournamentAdminForm.includes("Partner") &&
      !tournamentAdminForm.includes("partner") &&
      !tournamentAdminForm.includes("setTournamentPartner"),
    "no admin UI yet",
  );
  assert(
    !tournamentDetail.includes("Partner des Turniers") &&
      !tournamentDetail.includes("listPublicActivePartnersForTournament") &&
      partnerPage.includes("listPublicActivePartners") &&
      infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3") &&
      !partnerGrid.includes("tracking-[0.14em] text-brand-blue uppercase"),
    "no public UI changes; homepage max-3 + eyebrow still intact",
  );

  assert(
    database.includes("set_tournament_partner_assignments") &&
      queries.includes("getAdminTournamentPartnerAssignmentState") &&
      queries.includes("listPublicActivePartnersForTournament"),
    "database types + Phase 2A query helpers present",
  );

  assert(
    !migration.includes("service_role") &&
      !migration.includes("storage.buckets") &&
      !migration.includes("dynamic SQL") &&
      !migration.includes("EXECUTE format"),
    "no service_role/storage/dynamic SQL broadening",
  );

  return "ok";
}
