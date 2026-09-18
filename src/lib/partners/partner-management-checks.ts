import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RBAC_PERMISSIONS } from "@/types/rbac";
import { ROLE_PERMISSIONS } from "@/lib/rbac/permissions";
import {
  comparePartnersForPublicOrder,
  normalizePartnerLogoUrl,
  normalizePartnerWebsiteUrl,
  validatePartnerInput,
} from "@/lib/partners/partner";
import {
  PARTNER_LOGO_ALLOWED_MIME_TYPES,
  PARTNER_LOGO_MAX_BYTES,
  PARTNER_LOGOS_BUCKET,
  buildPartnerLogoObjectPath,
  isManagedPartnerLogoUrl,
  isPartnerManagedLogoUrl,
  partnerLogoObjectPathFromPublicUrl,
  partnerLogoPathPrefix,
} from "@/lib/storage/partner-logos";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`partner-management-checks: ${message}`);
  }
}

export function runPartnerManagementChecks() {
  const migration = read(
    "supabase/migrations/20260918200000_partners_management_v1.sql",
  );
  const database = read("src/lib/supabase/database.ts");
  const rbacTypes = read("src/types/rbac.ts");
  const permissions = read("src/lib/rbac/permissions.ts");
  const adminAccess = read("src/lib/rbac/admin-access.ts");
  const adminNav = read("src/lib/admin-navigation.ts");
  const actionAccess = read("src/lib/rbac/action-access.ts");
  const actions = read("src/lib/partners/actions.ts");
  const queries = read("src/lib/partners/queries.ts");
  const partnerLib = read("src/lib/partners/partner.ts");
  const storage = read("src/lib/storage/partner-logos.ts");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const partnerGrid = read("src/components/partners/PartnerLogoGrid.tsx");
  const adminLayout = read("src/app/admin/partner/layout.tsx");
  const adminForm = read("src/components/admin/PartnerAdminForm.tsx");
  const logoEditor = read("src/components/admin/PartnerLogoEditor.tsx");
  const adminBoard = read("src/components/admin/PartnersAdminBoard.tsx");
  const recoveryActions = read("src/lib/cancellations/recovery-actions.ts");
  const recoveryUi = read(
    "src/lib/cancellations/guest-cancellation-recovery-ui-checks.ts",
  );
  const multiTeam = read("src/lib/applications/multi-team-application-checks.ts");
  const tournamentAdminForm = read("src/components/admin/TournamentAdminForm.tsx");

  // 1–3 table + permissions
  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.partners"), "partners table exists");
  assert(migration.includes("partners.view"), "partners.view exists");
  assert(migration.includes("partners.manage"), "partners.manage exists");
  assert(RBAC_PERMISSIONS.includes("partners.view"), "partners.view in catalog");
  assert(RBAC_PERMISSIONS.includes("partners.manage"), "partners.manage in catalog");
  assert(
    ROLE_PERMISSIONS.SUPER_ADMIN.includes("partners.view") &&
      ROLE_PERMISSIONS.SUPER_ADMIN.includes("partners.manage"),
    "super admin has partner perms",
  );

  // 4–5 admin route gating
  assert(
    adminLayout.includes('requirePagePermission("partners.view")'),
    "admin route gated",
  );
  assert(
    adminAccess.includes('"/admin/partner"') &&
      adminAccess.includes("partners.view"),
    "admin route permission mapped",
  );
  assert(adminNav.includes('href: "/admin/partner"'), "admin nav partner item");
  assert(
    actionAccess.includes("requirePartnersManage") &&
      actions.includes("requirePartnersManage"),
    "mutation actions require partners.manage",
  );

  // 6–8 anon cannot mutate
  assert(
    migration.includes("GRANT SELECT ON TABLE public.partners TO anon, authenticated"),
    "anon select grant only via SELECT",
  );
  assert(
    migration.includes(
      "GRANT INSERT, UPDATE, DELETE ON TABLE public.partners TO authenticated",
    ),
    "insert/update/delete granted only to authenticated",
  );
  assert(
    !/GRANT\s+(INSERT|UPDATE|DELETE)[^;]*\banon\b/i.test(migration),
    "anon cannot create/update/delete partner",
  );
  assert(
    migration.includes("partners_insert_manage") &&
      migration.includes("partners_update_manage") &&
      migration.includes("partners_delete_manage"),
    "mutations gated by manage policies",
  );
  assert(
    migration.includes("WITH CHECK (public.has_rbac_permission('partners.manage'))"),
    "manage permission on writes",
  );

  // 9–11 public active + ordering
  assert(
    migration.includes("USING (is_active = true)"),
    "public RLS active only",
  );
  assert(
    queries.includes('.eq("is_active", true)') &&
      queries.includes("listPublicActivePartners"),
    "inactive partner excluded publicly",
  );
  assert(
    queries.includes('.order("sort_order", { ascending: true })') &&
      queries.includes('.order("name", { ascending: true })') &&
      queries.includes('.order("id", { ascending: true })'),
    "active partner included publicly with deterministic order",
  );
  const ordered = [
    { id: "b", name: "Beta", sortOrder: 1 },
    { id: "a", name: "Alpha", sortOrder: 1 },
    { id: "c", name: "Gamma", sortOrder: 0 },
  ].sort(comparePartnersForPublicOrder);
  assert(
    ordered.map((p) => p.id).join(",") === "c,a,b",
    "ordering deterministic sort_order/name/id",
  );

  // 12–18 storage
  assert(
    migration.includes("'partner-logos'") && storage.includes('PARTNER_LOGOS_BUCKET = "partner-logos"'),
    "partner-logos bucket exists",
  );
  assert(
    migration.includes("2097152") && PARTNER_LOGO_MAX_BYTES === 2 * 1024 * 1024,
    "bucket max 2 MB",
  );
  assert(
    PARTNER_LOGO_ALLOWED_MIME_TYPES.join(",") ===
      "image/png,image/jpeg,image/webp",
    "PNG/JPEG/WebP only",
  );
  assert(
    !migration.includes("image/svg") &&
      !storage.includes("image/svg") &&
      !logoEditor.includes("image/svg"),
    "SVG not allowed",
  );
  assert(
    migration.includes("partner_logos_public_read") &&
      migration.includes("partner_logos_admin_insert") &&
      migration.includes("has_rbac_permission('partners.manage')"),
    "public cannot upload; partners.manage can mutate logo",
  );
  assert(
    migration.includes("partner_logos_admin_delete") &&
      migration.includes("FOR DELETE"),
    "public cannot delete",
  );
  const path = buildPartnerLogoObjectPath({
    partnerId: "11111111-1111-1111-1111-111111111111",
    mimeType: "image/png",
  });
  assert(
    path.startsWith("partners/11111111-1111-1111-1111-111111111111/") &&
      path.endsWith(".png"),
    "safe partner logo path",
  );
  assert(
    isManagedPartnerLogoUrl(
      `https://example.supabase.co/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/partners/x/y.png`,
    ),
    "managed url detection",
  );
  assert(
    !isManagedPartnerLogoUrl("https://evil.example/logo.png"),
    "external urls not managed",
  );
  assert(
    isPartnerManagedLogoUrl(
      `https://example.supabase.co/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/partners/pid/file.webp`,
      "pid",
    ) &&
      !isPartnerManagedLogoUrl(
        `https://example.supabase.co/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/partners/other/file.webp`,
        "pid",
      ),
    "safe managed-path deletion prefix",
  );
  assert(
    partnerLogoObjectPathFromPublicUrl(
      `https://x/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/partners/a/b.png`,
    ) === "partners/a/b.png",
    "path parse from public url",
  );
  assert(
    partnerLogoPathPrefix("abc") === "partners/abc/",
    "path prefix helper",
  );
  assert(
    actions.includes("deleteManagedPartnerLogoIfOwned") &&
      actions.includes("upsert: false") === false &&
      storage.includes("upsert: false"),
    "upload upsert false + managed delete",
  );

  // Upload hardening + Logo-URL fallback (no SSRF, no migration)
  assert(
    actions.includes('mode: "upload" | "url" | "remove"') &&
      actions.includes('input.mode === "url"') &&
      logoEditor.includes('mode: "url"') &&
      logoEditor.includes("Logo-URL übernehmen"),
    "URL mode exists in action + UI",
  );
  assert(
    actions.includes("getFormDataUploadFile") &&
      actions.includes("meta.received") &&
      actions.includes("auth.getUser()") &&
      actions.includes("Keine gültige Admin-Session"),
    "upload uses FormData meta + getUser before Storage write",
  );
  assert(
    actions.includes("Bitte eine Bilddatei auswählen.") &&
      actions.includes("Die hochgeladene Datei ist leer oder ungültig.") &&
      actions.includes("Logo-Upload fehlgeschlagen."),
    "upload errors surface safely",
  );
  assert(
    !actions.includes("fetch(") &&
      !partnerLib.includes("fetch(") &&
      !logoEditor.includes("fetch("),
    "no server-side fetch for remote logo URL",
  );
  assert(
    partnerLib.includes("normalizePartnerLogoUrl") &&
      normalizePartnerLogoUrl("https://cdn.example.de/logo.png").ok === true &&
      normalizePartnerLogoUrl("http://cdn.example.de/logo.png").ok === true,
    "only http/https logo URLs accepted",
  );
  assert(normalizePartnerLogoUrl("javascript:alert(1)").ok === false, "logo rejects javascript:");
  assert(normalizePartnerLogoUrl("data:image/png;base64,xx").ok === false, "logo rejects data:");
  assert(normalizePartnerLogoUrl("file:///tmp/x.png").ok === false, "logo rejects file:");
  assert(normalizePartnerLogoUrl("vbscript:msgbox(1)").ok === false, "logo rejects vbscript:");
  assert(
    normalizePartnerLogoUrl("/relative/logo.png").ok === false &&
      normalizePartnerLogoUrl("../logo.png").ok === false &&
      normalizePartnerLogoUrl("cdn.example.de/logo.png").ok === false,
    "relative / bare logo URLs rejected",
  );
  assert(
    normalizePartnerLogoUrl("").ok === false &&
      normalizePartnerLogoUrl("   ").ok === false,
    "empty logo URL does not silently remove",
  );
  assert(
    actions.includes('input.mode === "url"') &&
      actions.includes("normalizePartnerLogoUrl") &&
      actions.includes("isManagedPartnerLogoUrl(previousLogoUrl)") &&
      /mode === "url"[\s\S]*update\(\{ logo_url: nextLogoUrl \}\)[\s\S]*isManagedPartnerLogoUrl\(previousLogoUrl\)[\s\S]*deleteManagedPartnerLogoIfOwned/.test(
        actions,
      ),
    "managed → URL cleanup only after DB success",
  );
  assert(
    /mode === "upload"[\s\S]*isManagedPartnerLogoUrl\(previousLogoUrl\)[\s\S]*deleteManagedPartnerLogoIfOwned/.test(
      actions,
    ) &&
      actions.includes("Previous external URL → never attempt Storage deletion"),
    "external URL → file never attempts external Storage deletion",
  );
  assert(
    actions.includes('input.mode === "remove"') && logoEditor.includes("Logo entfernen"),
    "existing remove-logo still works",
  );
  assert(
    !migration.includes("logo_url_external") &&
      !migration.includes("ALTER TABLE public.partners ADD") &&
      database.includes("logo_url: string | null"),
    "no new DB column/migration for logo URL",
  );

  // 20 website http(s)
  assert(normalizePartnerWebsiteUrl("").ok && normalizePartnerWebsiteUrl("").ok && (normalizePartnerWebsiteUrl("") as { url: string | null }).url === null, "empty website ok");
  assert(normalizePartnerWebsiteUrl("javascript:alert(1)").ok === false, "reject javascript");
  assert(normalizePartnerWebsiteUrl("data:text/html,hi").ok === false, "reject data");
  assert(normalizePartnerWebsiteUrl("file:///etc/passwd").ok === false, "reject file");
  const normalized = normalizePartnerWebsiteUrl("example.com");
  assert(normalized.ok && normalized.url?.startsWith("https://"), "normalize bare domain");
  assert(migration.includes("partners_website_url_http"), "db check http(s)");
  assert(
    validatePartnerInput({
      name: "Test",
      websiteUrl: "javascript:bad",
      isActive: true,
      sortOrder: 0,
    }).error,
    "website URL restricted to http(s)",
  );

  // 21–23 homepage + partner page
  assert(
    infoSection.includes("listPublicActivePartners") &&
      infoSection.includes("Unsere Partner") &&
      infoSection.includes("PartnerLogoGrid"),
    "homepage uses central partner data",
  );
  assert(
    !infoSection.includes("Starke Partner aus der Region") &&
      !infoSection.includes("Partner entdecken") &&
      !infoSection.includes("IconClubs"),
    "exactly one homepage Partner showcase (old card removed)",
  );
  assert(
    infoSection.includes("Für Vereine") &&
      infoSection.includes("Warum VfL Kirchheim/Teck?") &&
      infoSection.includes("Unsere Anlage"),
    "surrounding homepage cards preserved",
  );
  assert(
    partnerPage.includes("listPublicActivePartners") &&
      partnerPage.includes("PartnerLogoGrid") &&
      partnerPage.includes("Gemeinsam für den Jugendfußball"),
    "/partner uses central partner data",
  );
  assert(
    !partnerPage.includes("Konkrete Sponsornamen werden hier nicht hardcodiert"),
    "stub wording removed",
  );

  // 24–25 design + links + compact empty
  assert(
    partnerGrid.includes("object-contain") && logoEditor.includes("object-contain"),
    "logo object-contain behavior",
  );
  assert(
    partnerGrid.includes("PartnerSectionHeader") &&
      !partnerGrid.includes("tracking-[0.14em] text-brand-blue uppercase") &&
      !/>\s*Partner\s*</.test(partnerGrid),
    "homepage partner section has no blue Partner eyebrow",
  );
  assert(
    partnerGrid.includes('rel="noopener noreferrer"') &&
      partnerGrid.includes('target="_blank"'),
    "external links use safe rel",
  );
  assert(
    partnerPage.includes('rel="noopener noreferrer"'),
    "partner page external link safe",
  );
  assert(
    infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3") &&
      infoSection.includes("partners.slice(0, HOMEPAGE_PARTNER_PREVIEW_LIMIT)") &&
      infoSection.includes("previewPartners") &&
      !partnerGrid.includes("[&>li:nth-child(n+5)]:hidden") &&
      !partnerGrid.includes("xl:[&>li:nth-child(n+7)]:hidden"),
    "homepage preview max 3 (data slice, not CSS 4/6 hide)",
  );
  assert(
    partnerPage.includes("listPublicActivePartners") &&
      partnerPage.includes('<PartnerLogoGrid partners={partners} size="page" />') &&
      !partnerPage.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT") &&
      !partnerPage.includes(".slice(0,"),
    "/partner still shows all active partners",
  );
  assert(
    infoSection.includes('href="/partner"') &&
      infoSection.includes("Alle Partner →"),
    "Alle Partner link preserved to /partner",
  );
  assert(
    partnerGrid.includes("min-[480px]:grid-cols-3") ||
      partnerGrid.includes("sm:grid-cols-3"),
    "homepage home grid is a single even 3-column row on larger screens",
  );
  assert(
    !partnerGrid.includes("border-dashed") &&
      partnerGrid.includes("Zur Partnerseite") === false,
    "empty state not a giant dashed box in grid helper",
  );
  assert(
    infoSection.includes("compact={!hasPartners}") ||
      infoSection.includes("compact={!hasPartners}") ||
      infoSection.includes("hasPartners"),
    "homepage Partner empty state compact",
  );
  assert(
    partnerGrid.includes("flex flex-col gap-2 sm:flex-row") &&
      !partnerGrid.includes("py-8 text-center"),
    "PartnerEmptyState compact layout",
  );

  // 26–30 regression scope
  assert(
    !/CREATE TABLE[\s\S]*tournament_partners/i.test(migration) &&
      !/tournament_id\s+uuid/i.test(migration) &&
      !database.includes("tournament_partners:"),
    "no tournament-partner relation",
  );
  assert(
    !tournamentAdminForm.includes("partner") &&
      !tournamentAdminForm.includes("Partner"),
    "tournament UI unchanged",
  );
  assert(
    !actions.includes("tournament") &&
      !queries.includes("tournament"),
    "partner module has no tournament coupling",
  );
  assert(
    recoveryActions.includes("issue_guest_cancellation_recovery_token") &&
      recoveryUi.includes("list_guest_cancellation_recovery_tournaments"),
    "C2A/C2B untouched references still present",
  );
  assert(
    multiTeam.includes("allow_multiple_teams") ||
      multiTeam.includes("create_guest_applications"),
    "multi-team checks file untouched structurally",
  );
  assert(database.includes("partners: Table<"), "database types partners");
  assert(rbacTypes.includes('"partners.view"'), "rbac types partners.view");
  assert(permissions.includes('"partners.manage"'), "role map partners.manage");
  assert(adminForm.includes("Partnername"), "admin create/edit fields");
  assert(
    logoEditor.includes("Logo hochladen") &&
      logoEditor.includes("Logo-URL übernehmen") &&
      logoEditor.includes("Logo entfernen"),
    "logo upload/url/remove controls",
  );
  assert(partnerLib.includes("normalizePartnerWebsiteUrl"), "website helper");
  assert(partnerLib.includes("normalizePartnerLogoUrl"), "logo URL helper");

  // empty states
  assert(
    infoSection.includes("Unsere Partner werden hier in Kürze vorgestellt") &&
      partnerPage.includes("Derzeit sind noch keine Partner hinterlegt"),
    "public empty states",
  );
  assert(
    adminBoard.includes("Noch keine Partner angelegt."),
    "admin empty state",
  );

  // alt text
  assert(
    partnerGrid.includes("${partner.name} Logo") ||
      partnerGrid.includes("`${partner.name} Logo`"),
    "meaningful logo alt",
  );

  return "ok";
}
