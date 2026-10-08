import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_NAV_NIL_UUID,
  compareAdminNavCursors,
  formatAdminNavBadgeCount,
  isUnreadAdminNavItem,
  maxAdminNavCursor,
  mergeAdminNavCursor,
} from "@/lib/admin/nav-badges";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

export function runAdminNavBadgesChecks() {
  const migration = read(
    "supabase/migrations/20261008140000_admin_nav_seen_state.sql",
  );
  const actions = read("src/lib/admin/nav-badge-actions.ts");
  const navBadges = read("src/lib/admin/nav-badges.ts");
  const sidebar = read("src/components/admin/AdminSidebar.tsx");
  const layout = read("src/app/admin/layout.tsx");
  const marker = read("src/components/admin/AdminNavSeenMarker.tsx");
  const appsPage = read("src/app/admin/bewerbungen/page.tsx");
  const absagenPage = read("src/app/admin/absagen/page.tsx");
  const archiveHelper = read("src/lib/cancellations/cancellation-archive.ts");
  const cancelBoard = read("src/components/admin/CancellationRequestsBoard.tsx");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const cancelActions = read("src/lib/cancellations/actions.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");

  assert(migration.includes("CREATE TABLE IF NOT EXISTS public.admin_nav_seen_state"), "table");
  assert(migration.includes("PRIMARY KEY (user_id, nav_key)"), "composite pk");
  assert(
    migration.includes("nav_key IN ('applications', 'cancellations')"),
    "nav keys constrained",
  );
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "rls enabled");
  assert(
    migration.includes("user_id = auth.uid()") &&
      migration.includes("admin_nav_seen_state_select_own"),
    "per-user select isolation",
  );
  assert(
    migration.includes("GRANT SELECT ON TABLE public.admin_nav_seen_state TO authenticated") &&
      !migration.includes("GRANT UPDATE ON TABLE public.admin_nav_seen_state") &&
      !migration.includes("GRANT INSERT ON TABLE public.admin_nav_seen_state") &&
      !migration.includes("GRANT DELETE ON TABLE public.admin_nav_seen_state") &&
      migration.includes(
        "REVOKE INSERT, UPDATE, DELETE, TRUNCATE",
      ) &&
      migration.includes("ON TABLE public.admin_nav_seen_state") &&
      migration.includes("FROM authenticated"),
    "no direct write grants; explicit revoke of INSERT/UPDATE/DELETE/TRUNCATE",
  );
  assert(
    migration.includes("advance_admin_nav_seen_state") &&
      migration.includes("admin_nav_cursor_less") &&
      migration.includes("SECURITY DEFINER") &&
      migration.includes("SET search_path = public"),
    "monotonic advance RPC hardened",
  );
  assert(
    migration.includes("application.id = p_seen_id") &&
      migration.includes("application.created_at = p_seen_until") &&
      migration.includes("request.id = p_seen_id") &&
      migration.includes("request.requested_at = p_seen_until") &&
      migration.includes("Reject arbitrary / future cursors") &&
      migration.includes("RETURN false"),
    "advance validates cursor against visible authoritative rows",
  );
  // Mark-seen must not re-derive DB max (that would swallow concurrent arrivals).
  const advanceFnStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.advance_admin_nav_seen_state",
  );
  const advanceFnEnd = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_admin_nav_badge_counts",
  );
  assert(advanceFnStart >= 0 && advanceFnEnd > advanceFnStart, "advance fn bounds");
  const advanceFn = migration.slice(advanceFnStart, advanceFnEnd);
  assert(
    !advanceFn.includes("admin_nav_max_applications_cursor") &&
      !advanceFn.includes("admin_nav_max_cancellations_cursor") &&
      !advanceFn.includes("seen_until := now()") &&
      !advanceFn.includes("seen_until = now()"),
    "mark-seen keeps client snapshot cursor; no server max/now rewrite",
  );
  assert(
    migration.includes("get_admin_nav_badge_counts") &&
      migration.includes("admin_nav_ensure_bootstrap") &&
      migration.includes("'-infinity'::timestamptz") &&
      !migration.includes("seen_until = now()") &&
      !migration.includes("seen_until := now()"),
    "quiet bootstrap without wall-clock now()",
  );
  assert(
    migration.includes("ON CONFLICT (user_id, nav_key) DO UPDATE") &&
      migration.includes("WHERE public.admin_nav_cursor_less"),
    "bootstrap race upgrades monotonically and never regresses",
  );
  assert(
    migration.includes("archived_at IS NULL") &&
      migration.includes("has_rbac_permission('applications.view')") &&
      migration.includes("has_rbac_permission('cancellations.view')"),
    "permission + archive filters in counts",
  );
  assert(
    migration.includes(
      "REVOKE ALL ON FUNCTION public.admin_nav_ensure_bootstrap(text)",
    ) &&
      migration.includes("FROM PUBLIC, anon, authenticated") &&
      migration.includes(
        "GRANT EXECUTE ON FUNCTION public.get_admin_nav_badge_counts()",
      ) &&
      migration.includes(
        "GRANT EXECUTE ON FUNCTION public.advance_admin_nav_seen_state",
      ),
    "helper EXECUTE revoked; only public RPCs granted to authenticated",
  );
  assert(
    !migration.includes("GRANT EXECUTE ON FUNCTION public.admin_nav_ensure_bootstrap") &&
      !migration.includes("GRANT EXECUTE ON FUNCTION public.admin_nav_max_applications_cursor") &&
      !migration.includes("GRANT EXECUTE ON FUNCTION public.admin_nav_max_cancellations_cursor"),
    "internal helpers not granted to clients",
  );

  // Pure cursor helpers
  const older = { seenUntil: "2026-01-01T00:00:00.000Z", seenId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
  const newer = { seenUntil: "2026-01-02T00:00:00.000Z", seenId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
  const tieLow = { seenUntil: "2026-01-02T00:00:00.000Z", seenId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
  const tieHigh = { seenUntil: "2026-01-02T00:00:00.000Z", seenId: "cccccccc-cccc-cccc-cccc-cccccccccccc" };

  assert(compareAdminNavCursors(older, newer) < 0, "timestamp ordering");
  assert(compareAdminNavCursors(tieLow, tieHigh) < 0, "equal timestamps use id");
  assert(
    mergeAdminNavCursor(newer, older).seenUntil === newer.seenUntil,
    "older snapshot cannot regress state",
  );
  assert(
    mergeAdminNavCursor(tieHigh, tieLow).seenId === tieHigh.seenId,
    "multi-tab lower cursor rejected",
  );

  const equalTsItems = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", timestamp: "2026-01-02T00:00:00.000Z" },
    { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", timestamp: "2026-01-02T00:00:00.000Z" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", timestamp: "2026-01-01T00:00:00.000Z" },
  ];
  const max = maxAdminNavCursor(equalTsItems);
  assert(max?.seenId === "cccccccc-cccc-cccc-cccc-cccccccccccc", "max cursor prefers highest id on ties");
  assert(
    isUnreadAdminNavItem(
      { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", timestamp: "2026-01-02T00:00:00.000Z" },
      older,
    ),
    "new arrival after cursor is unread",
  );
  assert(
    !isUnreadAdminNavItem(
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", timestamp: "2026-01-01T00:00:00.000Z" },
      newer,
    ),
    "late-visible older timestamp stays below watermark (residual documented)",
  );
  assert(maxAdminNavCursor([]) === null, "empty snapshot yields null cursor");
  assert(ADMIN_NAV_NIL_UUID.endsWith("000000000000"), "nil uuid constant");

  assert(formatAdminNavBadgeCount(0) === null, "zero badge hidden");
  assert(formatAdminNavBadgeCount(4) === "4", "numeric badge");
  assert(formatAdminNavBadgeCount(99) === "99", "99 shown");
  assert(formatAdminNavBadgeCount(100) === "99+", "99+ display");

  assert(actions.includes("isMissingRelationError"), "missing migration fail-soft");
  assert(actions.includes("get_admin_nav_badge_counts"), "count RPC used");
  assert(actions.includes("advance_admin_nav_seen_state"), "advance RPC used");
  assert(
    actions.includes('revalidatePath("/admin", "layout")'),
    "layout revalidated after advanced mark-seen",
  );

  assert(layout.includes("loadAdminNavBadgeCountsAction"), "layout loads lightweight counts");
  assert(sidebar.includes("formatAdminNavBadgeCount"), "sidebar renders badges");
  assert(sidebar.includes("aria-label"), "accessible badge labels");
  assert(
    marker.includes("markAdminNavSeenAction") &&
      !sidebar.includes("markAdminNavSeenAction"),
    "mark-seen not triggered by sidebar render",
  );
  assert(appsPage.includes("AdminApplicationsNavSeen"), "applications section marks seen");
  assert(
    absagenPage.includes('navKey="cancellations"') &&
      absagenPage.includes("AdminNavSeenMarker"),
    "cancellations section marks seen",
  );
  assert(
    appsPage.includes("AdminApplicationsNavSeen") &&
      !appsPage.includes('navKey="cancellations"'),
    "opening applications does not clear cancellations",
  );
  assert(
    absagenPage.includes('navKey="cancellations"') &&
      !absagenPage.includes('navKey="applications"'),
    "opening cancellations does not clear applications",
  );

  assert(
    archiveHelper.includes('status === "pending"') &&
      cancelBoard.includes("Offene Absagen") &&
      cancelBoard.includes("Archiv"),
    "existing cancellation archive unchanged",
  );
  assert(
    !actions.includes("decideCancellationRequestAction") &&
      !actions.includes("updateApplicationStatusAction") &&
      !marker.includes("decideCancellationRequestAction"),
    "no decision/status mutations from badge code",
  );
  assert(
    cancelActions.includes("decideCancellationRequestAction") &&
      adminActions.includes("updateApplicationStatusAction"),
    "existing decision workflows remain elsewhere",
  );
  assert(
    !navBadges.includes("status === \"pending\"") &&
      !actions.includes("payment_status"),
    "unread not substituted with pending counts",
  );
  assert(
    runChecksCli.includes("runAdminNavBadgesChecks"),
    "suite wired into run-checks-cli",
  );

  return "ok";
}
