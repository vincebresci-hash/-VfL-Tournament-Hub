import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_PERMISSIONS } from "@/lib/rbac/permissions";
import { RBAC_PERMISSIONS } from "@/types/rbac";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-partner-assignment-checks: ${message}`);
  }
}

export function runTournamentPartnerAssignmentChecks() {
  const migration = read(
    "supabase/migrations/20260918210000_tournament_partners_phase2a.sql",
  );
  const partnersV1Migration = read(
    "supabase/migrations/20260918200000_partners_management_v1.sql",
  );
  const database = read("src/lib/supabase/database.ts");
  const queries = read("src/lib/partners/queries.ts");
  const actions = read("src/lib/partners/actions.ts");
  const partnerLib = read("src/lib/partners/partner.ts");
  const permissions = read("src/lib/rbac/permissions.ts");
  const rbacTypes = read("src/types/rbac.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerGrid = read("src/components/partners/PartnerLogoGrid.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const tournamentAdminForm = read("src/components/admin/TournamentAdminForm.tsx");
  const tournamentDetail = read("src/app/turniere/[slug]/page.tsx");
  const logoEditor = read("src/components/admin/PartnerLogoEditor.tsx");
  const recoveryActions = read("src/lib/cancellations/recovery-actions.ts");
  const recoveryUi = read(
    "src/lib/cancellations/guest-cancellation-recovery-ui-checks.ts",
  );
  const multiTeam = read("src/lib/applications/multi-team-application-checks.ts");

  // 1–6 schema
  assert(
    migration.includes("CREATE TABLE IF NOT EXISTS public.tournament_partners"),
    "tournament_partners schema exists in migration",
  );
  assert(
    migration.includes("tournament_id uuid NOT NULL") &&
      migration.includes("partner_id uuid NOT NULL") &&
      migration.includes("created_at timestamptz NOT NULL DEFAULT now()") &&
      migration.includes("id uuid PRIMARY KEY DEFAULT gen_random_uuid()"),
    "exact intended columns present",
  );
  assert(
    !/\bsort_order\b/.test(migration) &&
      !migration.includes("logo_url") &&
      !migration.includes("website_url") &&
      !/partner_name|tournament_name/i.test(migration),
    "NO sort_order / duplicated partner fields",
  );
  assert(
    migration.includes("UNIQUE (tournament_id, partner_id)") ||
      migration.includes("UNIQUE (tournament_id, partner_id)"),
    "UNIQUE tournament_id + partner_id",
  );
  assert(
    /REFERENCES public\.tournaments \(id\)\s+ON DELETE CASCADE/.test(migration),
    "tournament FK ON DELETE CASCADE",
  );
  assert(
    /REFERENCES public\.partners \(id\)\s+ON DELETE CASCADE/.test(migration),
    "partner FK ON DELETE CASCADE",
  );

  // 7–11 RLS / security
  assert(
    migration.includes("ENABLE ROW LEVEL SECURITY") &&
      migration.includes("tournament_partners_select_public") &&
      migration.includes("tournament_partners_insert_manage") &&
      migration.includes("tournament_partners_delete_manage"),
    "RLS enabled with select/insert/delete policies",
  );
  assert(
    migration.includes("can_view_archived_tournament(tournaments.archived_at)") &&
      /tournament_partners_select_public[\s\S]*anon, authenticated[\s\S]*EXISTS[\s\S]*FROM public\.tournaments/.test(
        migration,
      ),
    "public SELECT requires publicly viewable parent tournament",
  );
  assert(
    migration.includes(
      "GRANT SELECT ON TABLE public.tournament_partners TO anon, authenticated",
    ) &&
      migration.includes(
        "GRANT INSERT, UPDATE, DELETE ON TABLE public.tournament_partners TO authenticated",
      ) &&
      !/GRANT\s+(INSERT|UPDATE|DELETE)[^;]*\banon\b/i.test(migration),
    "anon cannot write",
  );
  assert(
    migration.includes("has_rbac_permission('tournaments.manage')") &&
      migration.includes("tournament_partners_insert_manage") &&
      migration.includes("WITH CHECK (public.has_rbac_permission('tournaments.manage'))"),
    "authenticated without tournaments.manage cannot write",
  );
  assert(
    migration.includes("has_rbac_permission('tournaments.manage')") &&
      !migration.includes("tournament_partners.manage") &&
      !/has_rbac_permission\('partners\.manage'\)/.test(migration) &&
      !/INSERT INTO public\.rbac_permissions[\s\S]*tournament_partners/.test(migration),
    "tournaments.manage is assignment permission",
  );

  // 12–13 RBAC
  assert(
    !migration.includes("INSERT INTO public.rbac_permissions") &&
      !rbacTypes.includes("tournament_partners") &&
      !RBAC_PERMISSIONS.includes("tournament_partners.manage" as never),
    "NO new RBAC permission key",
  );
  assert(
    !ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("partners.manage") &&
      !ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("partners.view") &&
      permissions.includes("TOURNAMENT_MANAGER:") &&
      ROLE_PERMISSIONS.TOURNAMENT_MANAGER.includes("tournaments.manage"),
    "partners.manage NOT granted to Tournament Manager",
  );

  // Narrow inactive partner admin read
  assert(
    migration.includes("partners_select_tournament_manage") &&
      migration.includes("ON public.partners") &&
      /partners_select_tournament_manage[\s\S]*FOR SELECT[\s\S]*tournaments\.manage/.test(
        migration,
      ) &&
      !/partners_select_tournament_manage[\s\S]*FOR (INSERT|UPDATE|DELETE)/.test(
        migration,
      ),
    "narrow partners SELECT for tournaments.manage (no write)",
  );

  // 14–16 public helper
  assert(
    queries.includes("listPublicActivePartnersForTournament") &&
      queries.includes('.eq("partners.is_active", true)') &&
      queries.includes("comparePartnersForPublicOrder"),
    "public query helper exists and filters active",
  );
  assert(
    queries.includes("listPublicActivePartnersForTournament") &&
      /listPublicActivePartnersForTournament[\s\S]*\.eq\("partners\.is_active", true\)/.test(
        queries,
      ),
    "inactive Partner cannot be returned by public tournament Partner helper",
  );
  assert(
    partnerLib.includes("comparePartnersForPublicOrder") &&
      queries.includes("sort(comparePartnersForPublicOrder)"),
    "public ordering = partner sort_order/name/id",
  );

  // 16–19 V1 / homepage / partner page unchanged behavior
  const publicListFn = queries.slice(
    queries.indexOf("export async function listPublicActivePartners()"),
    queries.indexOf("export async function listPublicActivePartnersForTournament"),
  );
  assert(
    publicListFn.includes('.from("partners")') &&
      publicListFn.includes('.eq("is_active", true)') &&
      !publicListFn.includes("tournament_partners"),
    "existing listPublicActivePartners unchanged",
  );
  assert(
    infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3") &&
      infoSection.includes("partners.slice(0, HOMEPAGE_PARTNER_PREVIEW_LIMIT)") &&
      infoSection.includes("previewPartners"),
    "homepage max-3 behavior from PR #83 unchanged",
  );
  assert(
    partnerGrid.includes("PartnerSectionHeader") &&
      !partnerGrid.includes("tracking-[0.14em] text-brand-blue uppercase") &&
      !/>\s*Partner\s*</.test(partnerGrid),
    "removed blue Partner eyebrow from PR #84 stays removed",
  );
  assert(
    partnerPage.includes("listPublicActivePartners") &&
      partnerPage.includes('<PartnerLogoGrid partners={partners} size="page" />') &&
      !partnerPage.includes("listPublicActivePartnersForTournament") &&
      !partnerPage.includes(".slice(0,"),
    "/partner behavior unchanged",
  );

  // 20–21 no denormalized columns
  assert(
    !partnersV1Migration.includes("tournament_id") &&
      !/ALTER TABLE public\.tournaments[\s\S]*partner_id/i.test(migration) &&
      !/ALTER TABLE public\.partners[\s\S]*tournament_id/i.test(migration) &&
      !migration.includes("ADD COLUMN partner_id") &&
      !migration.includes("ADD COLUMN tournament_id"),
    "tournaments gets NO partner_id column; partners gets NO tournament_id",
  );
  assert(
    database.includes("tournament_partners: Table<") &&
      database.includes("TournamentPartnerRow") &&
      !/TournamentRow[\s\S]{0,400}partner_id/.test(database),
    "database types include junction only",
  );

  // 22–23 Partner V1 / tournament create-update unchanged
  assert(
    actions.includes("requirePartnersManage") &&
      actions.includes("updatePartnerLogoAction") &&
      actions.includes('mode: "upload" | "url" | "remove"') &&
      !actions.includes("tournament_partners") &&
      !actions.includes("setTournamentPartner"),
    "Partner V1 CRUD/logo upload/logo URL unchanged",
  );
  assert(
    logoEditor.includes("Logo-URL übernehmen") && logoEditor.includes("Logo hochladen"),
    "logo editor controls unchanged",
  );
  assert(
    adminActions.includes("createTournamentAction") &&
      adminActions.includes("updateTournamentAction") &&
      !adminActions.includes("tournament_partners") &&
      !tournamentAdminForm.includes("Partner") &&
      !tournamentAdminForm.includes("partner"),
    "tournament create/update flow unchanged",
  );

  // 24–28 regression domains — Phase 2C public display is intentional
  assert(
    tournamentDetail.includes("listPublicActivePartnersForTournament") &&
      tournamentDetail.includes("TournamentPartnersSection") &&
      !tournamentDetail.includes("TournamentPartnerAssignmentCard"),
    "Phase 2C public Partner section present; admin card not on public page",
  );
  assert(
    !queries.includes("setTournamentPartner") &&
      queries.includes("getAdminTournamentPartnerAssignmentState"),
    "admin assignment state helper present; queries remain read-only",
  );
  assert(
    multiTeam.includes("allow_multiple_teams") ||
      multiTeam.includes("create_guest_applications"),
    "multi-team untouched structurally",
  );
  assert(
    recoveryActions.includes("issue_guest_cancellation_recovery_token") &&
      recoveryUi.includes("list_guest_cancellation_recovery_tournaments"),
    "cancellation/C2A/C2B untouched",
  );
  assert(
    !migration.includes("storage.buckets") &&
      !migration.includes("service_role") &&
      !migration.includes("SECURITY DEFINER"),
    "no Storage / service_role / SECURITY DEFINER broadening",
  );

  // indexes present
  assert(
    migration.includes("tournament_partners_tournament_id_idx") &&
      migration.includes("tournament_partners_partner_id_idx"),
    "indexes on tournament_id and partner_id",
  );

  return "ok";
}
