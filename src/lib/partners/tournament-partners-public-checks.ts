import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-partners-public-checks: ${message}`);
  }
}

export function runTournamentPartnersPublicChecks() {
  const tournamentDetail = read("src/app/turniere/[slug]/page.tsx");
  const section = read(
    "src/components/tournaments/TournamentPartnersSection.tsx",
  );
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const queries = read("src/lib/partners/queries.ts");
  const partnerLib = read("src/lib/partners/partner.ts");
  const partnerGrid = read("src/components/partners/PartnerLogoGrid.tsx");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const assignmentCard = read(
    "src/components/admin/TournamentPartnerAssignmentCard.tsx",
  );
  const assignmentActions = read(
    "src/lib/partners/tournament-partner-assignment-actions.ts",
  );
  const partnerActions = read("src/lib/partners/actions.ts");
  const tournamentAdminForm = read(
    "src/components/admin/TournamentAdminForm.tsx",
  );
  const phase2a = read(
    "supabase/migrations/20260918210000_tournament_partners_phase2a.sql",
  );
  const phase2ba = read(
    "supabase/migrations/20260919200000_set_tournament_partner_assignments_rpc.sql",
  );
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 1–4 page wiring + section
  assert(
    tournamentDetail.includes("listPublicActivePartnersForTournament") &&
      tournamentDetail.includes(
        "listPublicActivePartnersForTournament(tournament.id)",
      ),
    "public tournament detail uses listPublicActivePartnersForTournament(tournament.id)",
  );
  assert(
    tournamentDetail.includes("TournamentPartnersSection") &&
      tournamentDetail.includes(
        "<TournamentPartnersSection partners={tournamentPartners} />",
      ),
    "TournamentPartnersSection rendered on detail page",
  );
  assert(
    section.includes("Partner & Sponsoren") &&
      section.includes("PartnerLogoGrid") &&
      section.includes("PartnerSectionHeader") &&
      section.includes("partners.length === 0") &&
      section.includes("return null"),
    "TournamentPartnersSection exists with zero→null behavior",
  );

  // 5–6 zero partners / no empty heading path
  assert(
    /if \(partners\.length === 0\) \{\s*return null;\s*\}/.test(section) &&
      !section.includes("Keine Partner") &&
      !section.includes("PartnerEmptyState"),
    "zero Partners returns null; no empty heading/card",
  );

  // 7–8 all assigned active; no homepage max-3 on detail
  assert(
    tournamentDetail.includes("partners={tournamentPartners}") &&
      !tournamentDetail.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT") &&
      !tournamentDetail.includes(".slice(") &&
      !section.includes(".slice(") &&
      !section.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT"),
    "all assigned active Partners render; no homepage max-3 slice",
  );

  // 9–11 helper filters + ordering
  const helperStart = queries.indexOf(
    "export async function listPublicActivePartnersForTournament",
  );
  const helperEnd = queries.indexOf(
    "export async function listAdminPartners",
    helperStart,
  );
  const helper = queries.slice(helperStart, helperEnd);
  assert(
    helper.includes('.from("tournament_partners")') &&
      helper.includes('.eq("tournament_id", id)') &&
      helper.includes('.eq("partners.is_active", true)') &&
      helper.includes("partners!inner"),
    "public helper filters by tournament_id and is_active",
  );
  assert(
    helper.includes("sort(comparePartnersForPublicOrder)") &&
      partnerLib.includes("comparePartnersForPublicOrder"),
    "deterministic Partner ordering unchanged",
  );

  // 12–13 website link safety + missing logo
  assert(
    partnerGrid.includes('rel="noopener noreferrer"') &&
      partnerGrid.includes('target="_blank"'),
    "website link safety remains noopener noreferrer",
  );
  assert(
    partnerGrid.includes("partner.logoUrl") &&
      partnerGrid.includes("object-contain") &&
      /partner\.logoUrl \?[\s\S]*:[\s\S]*partner\.name/.test(partnerGrid),
    "missing-logo fallback remains available",
  );

  // 14 stage unchanged by Partner section (no Partner imports in stage)
  assert(
    !stage.includes("Partner") &&
      !stage.includes("partner") &&
      !stage.includes("TournamentPartnersSection") &&
      !stage.includes("listPublicActivePartnersForTournament"),
    "TournamentPublicStage implementation unchanged for Partners",
  );

  // section after hero / MeinTurnierplan, before facts
  const sectionIdx = tournamentDetail.indexOf(
    "<TournamentPartnersSection partners={tournamentPartners} />",
  );
  const factsIdx = tournamentDetail.indexOf("{facts.length > 0 ? (");
  const stageIdx = tournamentDetail.indexOf("<TournamentPublicStage");
  assert(
    sectionIdx > 0 &&
      factsIdx > sectionIdx &&
      stageIdx > factsIdx,
    "Partner section rendered after hero and before facts grid",
  );

  assert(
    section.includes('size="tournament"') &&
      partnerGrid.includes('"tournament"') &&
      partnerGrid.includes("flex flex-wrap gap-3") &&
      partnerGrid.includes("max-w-[17.5rem]"),
    "tournament Partner layout is compact (not homepage full-width cards)",
  );

  // Visual polish (tournament-scoped only)
  assert(
    section.includes('tone="secondary"') &&
      section.includes('className="mt-6"') &&
      partnerGrid.includes('tone?: "default" | "secondary"') &&
      partnerGrid.includes('tone = "default"'),
    "Partner heading uses secondary tone; shared header default unchanged",
  );
  assert(
    /isTournament[\s\S]*?tracking-normal text-ink/.test(partnerGrid) &&
      !/isTournament[\s\S]*?tracking-\[0\.04em\] text-ink uppercase/.test(
        partnerGrid,
      ),
    "tournament Partner name uses natural casing (no CSS uppercase)",
  );
  assert(
    partnerGrid.includes("h-14 w-[4.5rem]") &&
      partnerGrid.includes("width={72}") &&
      partnerGrid.includes("height={56}"),
    "tournament Partner logo slightly more prominent within compact tile",
  );
  const tournamentBranch = partnerGrid.slice(
    partnerGrid.indexOf("if (isTournament)"),
    partnerGrid.indexOf("const logoBoxClass"),
  );
  assert(
    tournamentBranch.includes("if (partner.websiteUrl)") &&
      tournamentBranch.includes(
        "[@media(hover:hover)]:hover:border-brand-yellow/55",
      ) &&
      !tournamentBranch.includes("hover:-translate-y") &&
      /return <div className=\{baseCardClass\}>\{content\}<\/div>/.test(
        tournamentBranch,
      ),
    "clickable tournament Partners get subtle hover; non-clickable do not",
  );
  assert(
    infoSection.includes('size="home"') &&
      !infoSection.includes('tone="secondary"') &&
      partnerPage.includes('size="page"') &&
      !partnerPage.includes('tone="secondary"') &&
      partnerGrid.includes("tracking-[0.06em] text-ink uppercase") &&
      partnerGrid.includes("hover:-translate-y-0.5") &&
      partnerGrid.includes("hover:scale-[1.01]"),
    "homepage and /partner Partner typography/hover defaults unchanged",
  );

  // Facts compact + Freie Plätze presentation-only emphasis
  assert(
    tournamentDetail.includes('label: "Freie Plätze"') &&
      tournamentDetail.includes("getDisplayCapacity(tournament)") &&
      tournamentDetail.includes('fact.label === "Freie Plätze"') &&
      tournamentDetail.includes("bg-brand-yellow/25") &&
      tournamentDetail.includes("px-3.5 py-2.5") &&
      tournamentDetail.includes("gap-2.5 sm:grid-cols-2 xl:grid-cols-3"),
    "facts grid more compact; Freie Plätze yellow accent is presentation-only",
  );
  assert(
    !tournamentDetail.includes("availableSlots +") &&
      !tournamentDetail.includes("availableSlots -") &&
      tournamentDetail.includes("String(capacity.availableSlots)"),
    "capacity value formatting unchanged (display String only)",
  );

  // 15–19 homepage / partner / admin / V1 unchanged
  assert(
    infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3") &&
      infoSection.includes("listPublicActivePartners()") &&
      !infoSection.includes("listPublicActivePartnersForTournament"),
    "homepage Partner section + max-3 unchanged",
  );
  assert(
    partnerPage.includes("listPublicActivePartners") &&
      !partnerPage.includes("listPublicActivePartnersForTournament") &&
      !partnerPage.includes("TournamentPartnersSection"),
    "/partner unchanged",
  );
  assert(
    assignmentCard.includes("Partner & Sponsoren") &&
      assignmentActions.includes("set_tournament_partner_assignments") &&
      assignmentActions.includes("requireTournamentsManage()"),
    "admin Partner assignment unchanged",
  );
  assert(
    partnerActions.includes("requirePartnersManage") &&
      partnerActions.includes("updatePartnerLogoAction") &&
      !partnerActions.includes("listPublicActivePartnersForTournament") &&
      !tournamentAdminForm.includes("TournamentPartnersSection"),
    "Partner Management V1 unchanged",
  );

  // 20–21 no migration / RPC / RLS / RBAC drift in this phase
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
    "no Phase 2C migration added",
  );
  assert(
    phase2a.includes("CREATE TABLE IF NOT EXISTS public.tournament_partners") &&
      phase2ba.includes(
        "CREATE OR REPLACE FUNCTION public.set_tournament_partner_assignments(",
      ),
    "Phase 2A / Phase 2B-A migrations unchanged presence",
  );
  assert(
    !tournamentDetail.includes("service_role") &&
      !section.includes("service_role"),
    "no service_role on public Partner display",
  );

  return "ok";
}
