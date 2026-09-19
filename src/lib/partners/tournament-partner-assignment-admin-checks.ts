import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-partner-assignment-admin-checks: ${message}`);
  }
}

export function runTournamentPartnerAssignmentAdminChecks() {
  const editPage = read("src/app/admin/turniere/[id]/bearbeiten/page.tsx");
  const createPage = read("src/app/admin/turniere/neu/page.tsx");
  const card = read("src/components/admin/TournamentPartnerAssignmentCard.tsx");
  const action = read(
    "src/lib/partners/tournament-partner-assignment-actions.ts",
  );
  const queries = read("src/lib/partners/queries.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  const partnerActions = read("src/lib/partners/actions.ts");
  const tournamentAdminForm = read(
    "src/components/admin/TournamentAdminForm.tsx",
  );
  const tournamentDetail = read("src/app/turniere/[slug]/page.tsx");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const phase2a = read(
    "supabase/migrations/20260918210000_tournament_partners_phase2a.sql",
  );
  const phase2ba = read(
    "supabase/migrations/20260919200000_set_tournament_partner_assignments_rpc.sql",
  );
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 1–2 edit vs create
  assert(
    editPage.includes("TournamentPartnerAssignmentCard") &&
      editPage.includes(
        "getAdminTournamentPartnerAssignmentState(tournament.id)",
      ),
    "edit page loads assignment state and renders card",
  );
  assert(
    !createPage.includes("TournamentPartnerAssignmentCard") &&
      !createPage.includes("getAdminTournamentPartnerAssignmentState") &&
      !createPage.includes("Partner"),
    "create page has no assignment UI",
  );

  // 3–4 authorization
  assert(
    action.includes("requireTournamentsManage()"),
    "assignment action uses tournaments.manage",
  );
  assert(
    !action.includes("requirePartnersManage") &&
      !action.includes("partners.manage"),
    "assignment action does not require partners.manage",
  );

  // 5–6 dedicated RPC action; tournament update untouched
  assert(
    action.includes('supabase.rpc("set_tournament_partner_assignments"') &&
      action.includes("p_tournament_id") &&
      action.includes("p_partner_ids"),
    "dedicated action calls set_tournament_partner_assignments",
  );
  assert(
    !adminActions.includes("set_tournament_partner_assignments") &&
      !adminActions.includes("setTournamentPartnerAssignmentsAction") &&
      !adminActions.includes("tournament_partners"),
    "updateTournamentAction / admin-actions untouched by assignment persistence",
  );
  assert(
    !partnerActions.includes("set_tournament_partner_assignments") &&
      !partnerActions.includes("setTournamentPartnerAssignmentsAction"),
    "Partner V1 actions untouched by assignment RPC",
  );

  // 7–10 checkbox universe / inactive labeling
  assert(
    card.includes("availableActivePartners") &&
      card.includes("inactiveAssignedPartners") &&
      card.includes("assignedPartnerIds"),
    "card uses active + assigned-inactive universe from assignment state",
  );
  assert(
    /availableActivePartners\s*=\s*allPartners\.filter\(\(partner\) => partner\.isActive\)/.test(
      queries,
    ),
    "active Partners offered via availableActivePartners",
  );
  assert(
    /inactiveAssignedPartners\s*=\s*assignedPartners\.filter\(\(partner\) => !partner\.isActive\)/.test(
      queries,
    ),
    "assigned inactive Partners included; unrelated inactive excluded",
  );
  assert(
    card.includes("Inaktiv") && card.includes("!partner.isActive"),
    "inactive assigned Partner marked Inaktiv",
  );

  // 11 empty selection
  assert(
    action.includes("p_partner_ids: normalized") &&
      card.includes("Array.from(selectedIds)"),
    "empty selection can be sent as []",
  );

  // 12 load failure safety — ready gate before form/save
  assert(
    card.includes("if (!ready)") &&
      card.includes("Speichern ist") &&
      !card.includes("setTournamentPartnerAssignmentsAction(\n      tournamentId,\n      []"),
    "load failure disables save; cannot accidentally clear assignments",
  );
  assert(
    /async function handleSubmit[\s\S]*if \(!ready \|\| pending\)[\s\S]*return;/.test(
      card,
    ),
    "submit handler aborts when not ready",
  );

  // 13–17 public Phase 2C uses helper; admin card must not appear on public page
  assert(
    tournamentDetail.includes("listPublicActivePartnersForTournament") &&
      tournamentDetail.includes("TournamentPartnersSection") &&
      !tournamentDetail.includes("TournamentPartnerAssignmentCard") &&
      !tournamentDetail.includes("setTournamentPartnerAssignmentsAction"),
    "public tournament Partner display present; admin assignment UI not on public page",
  );
  const partnerMigrations = migrationFiles.filter((name) =>
    /partner/i.test(name),
  );
  assert(
    partnerMigrations.length === 3 &&
      partnerMigrations.includes("20260918200000_partners_management_v1.sql") &&
      partnerMigrations.includes(
        "20260918210000_tournament_partners_phase2a.sql",
      ) &&
      partnerMigrations.includes(
        "20260919200000_set_tournament_partner_assignments_rpc.sql",
      ),
    "no Phase 2B-B migration added (only V1 + 2A + 2B-A partner migrations)",
  );
  assert(
    phase2ba.includes(
      "CREATE OR REPLACE FUNCTION public.set_tournament_partner_assignments(",
    ) &&
      phase2a.includes("CREATE TABLE IF NOT EXISTS public.tournament_partners"),
    "Phase 2A / Phase 2B-A migrations still present",
  );
  assert(
    partnerPage.includes("listPublicActivePartners") &&
      infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3"),
    "Partner V1 public + homepage max-3 unchanged",
  );
  assert(
    !tournamentAdminForm.includes("Partner") &&
      !tournamentAdminForm.includes("partner") &&
      !tournamentAdminForm.includes("setTournamentPartner") &&
      !tournamentAdminForm.includes("setTournamentPartnerAssignmentsAction"),
    "TournamentAdminForm create/update form unchanged (assignment is separate card)",
  );

  // UI title + success copy
  assert(
    card.includes("Partner & Sponsoren") &&
      card.includes("Partner-Zuordnung gespeichert."),
    "card title and success message present",
  );

  return "ok";
}
