import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MULTI_TEAM_APPLICATION_MAX,
  buildGuestMultiTeamNames,
  formatMultiTeamNamesForEmail,
} from "@/lib/applications/multi-team-names";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

export function runMultiTeamApplicationChecks() {
  // Guest naming helpers
  assert(
    buildGuestMultiTeamNames("U9", 1).join("|") === "U9",
    "N=1 keeps exact base name",
  );
  assert(
    buildGuestMultiTeamNames("U9", 2).join("|") === "U9 I|U9 II",
    "N=2 Roman suffixes",
  );
  assert(
    buildGuestMultiTeamNames("U9", 3).join("|") === "U9 I|U9 II|U9 III",
    "N=3 Roman suffixes",
  );
  assert(
    buildGuestMultiTeamNames("U9 I", 2).join("|") === "U9 I|U9 II",
    "existing terminal Roman suffix is stripped before rebuilding",
  );
  assert(
    buildGuestMultiTeamNames("  FC Beispiel U9  ", 1).join("|") === "FC Beispiel U9",
    "N=1 trims without renaming",
  );
  assert(
    formatMultiTeamNamesForEmail(["U9 I", "U9 II"]) === "U9 I, U9 II",
    "email combines team names",
  );
  assert(MULTI_TEAM_APPLICATION_MAX === 3, "PR-B max is 3");

  let threw = false;
  try {
    buildGuestMultiTeamNames("U9", 4);
  } catch {
    threw = true;
  }
  assert(threw, "N=4 naming helper rejects");

  const migration = read(
    "supabase/migrations/20260917140000_multi_team_application_rpcs.sql",
  );
  const actions = read("src/lib/applications/actions.ts");
  const form = read("src/components/apply/ApplicationForm.tsx");
  const applyPage = read("src/app/turniere/[slug]/bewerben/page.tsx");
  const capacity = read("src/lib/tournament-capacity.ts");
  const cancellation = read("src/lib/cancellations/actions.ts");
  const payments = read("src/lib/payments/payment-checks.ts");
  const communications = read("src/lib/communications/actions.ts");

  // Migration / RPC security contract
  assert(
    migration.includes("CREATE OR REPLACE FUNCTION public.create_guest_applications"),
    "guest batch RPC exists",
  );
  assert(
    migration.includes("CREATE OR REPLACE FUNCTION public.create_club_applications"),
    "club batch RPC exists",
  );
  assert(
    migration.includes("SECURITY DEFINER") &&
      migration.includes("SET search_path = public"),
    "SECURITY DEFINER with search_path",
  );
  assert(
    migration.includes("allow_multiple_teams") &&
      migration.includes("v_allow_multiple IS NOT TRUE"),
    "RPCs enforce tournament flag server-side",
  );
  assert(
    migration.includes("v_count < 2 OR v_count > 3"),
    "batch bounds are 2..3",
  );
  assert(
    migration.includes("IF auth.uid() IS NOT NULL") &&
      migration.includes("Gastbewerbungen sind nur ohne Anmeldung möglich."),
    "guest batch rejects authenticated callers",
  );
  assert(
    migration.includes("guest_application_allowed"),
    "guest availability gate reused",
  );
  assert(
    migration.includes("current_club_id()") &&
      migration.includes("v_team.club_id IS DISTINCT FROM v_club_id"),
    "club batch verifies team ownership",
  );
  assert(
    migration.includes("Jede Mannschaft darf nur einmal ausgewählt werden."),
    "club batch rejects duplicate team ids",
  );
  assert(
    migration.includes("Diese Mannschaft wurde bereits für dieses Turnier angemeldet."),
    "club batch fails when team already applied",
  );
  assert(
    !migration.includes("GRANT INSERT") &&
      !migration.includes("GRANT UPDATE") &&
      !migration.includes("GRANT ALL"),
    "migration does not widen table privileges",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.create_guest_applications(jsonb, text[]) TO anon;",
    ),
    "guest EXECUTE grant to anon only",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.create_club_applications(uuid, uuid[], jsonb) TO authenticated;",
    ),
    "club EXECUTE grant to authenticated only",
  );
  assert(
    !migration.includes("CREATE POLICY") &&
      !migration.includes("ALTER POLICY") &&
      !migration.includes("DROP POLICY"),
    "no RLS policy changes",
  );
  assert(
    !migration.includes("submission_group_id") &&
      !migration.includes("team_count"),
    "no parent/child or team_count schema",
  );

  // Apply page flag wiring
  assert(
    applyPage.includes("allowMultipleTeams={tournament.allowMultipleTeams === true}"),
    "apply page passes tournament flag",
  );

  // Form OFF / ON controls
  assert(
    form.includes("allowMultipleTeams = false"),
    "form defaults allowMultipleTeams off",
  );
  assert(
    form.includes('label="Anzahl Mannschaften"'),
    "guest quantity control present when enabled",
  );
  assert(
    form.includes("guestQuantityEnabled") &&
      form.includes("clubMultiSelectEnabled"),
    "guest quantity and club multi-select are gated separately",
  );
  assert(
    form.includes("if (submitting)") && form.includes("disabled={submitting}"),
    "submit pending-state protection exists",
  );
  assert(
    form.includes("MULTI_TEAM_APPLICATION_MAX"),
    "form respects max 3",
  );

  // Action paths
  assert(
    actions.includes("create_guest_application") &&
      actions.includes("create_guest_applications") &&
      actions.includes("create_club_applications"),
    "single and batch RPCs are both used",
  );
  assert(
    actions.includes("Mehrfachmeldungen sind für dieses Turnier nicht freigeschaltet."),
    "crafted N>1 while flag OFF is rejected",
  );
  assert(
    actions.includes("tournament.allowMultipleTeams === true"),
    "server reads authoritative tournament flag",
  );
  assert(
    actions.includes("submitClubApplication") &&
      actions.includes("submitGuestApplication"),
    "existing single-team helpers remain",
  );
  assert(
    actions.includes("parseBatchApplicationIds") &&
      actions.includes('from "@/lib/applications/rpc-uuid-array"'),
    "batch paths normalize PostgREST uuid[] return shapes",
  );
  assert(
    !actions.includes("Array.isArray(data) ? data.map(String) : []"),
    "no fragile Array.isArray-only batch id parsing",
  );
  assert(
    actions.includes("sendApplicationReceivedEmail") &&
      actions.includes("formatMultiTeamNamesForEmail"),
    "one confirmation email uses combined team names",
  );

  // Ensure single confirmation call site (not a loop over ids)
  const emailCallCount = actions.split("sendApplicationReceivedEmail(").length - 1;
  assert(emailCallCount === 1, "exactly one received-email call site");

  // Regression: capacity / cancel / payment / communications untouched by multi-team logic
  assert(
    !capacity.includes("allow_multiple_teams") &&
      !capacity.includes("allowMultipleTeams") &&
      !capacity.includes("create_guest_applications"),
    "capacity logic unchanged",
  );
  assert(
    !cancellation.includes("create_guest_applications") &&
      !cancellation.includes("create_club_applications"),
    "cancellation unchanged",
  );
  assert(
    !payments.includes("create_guest_applications"),
    "payment checks unchanged",
  );
  assert(
    !communications.includes("create_guest_applications") &&
      !communications.includes("create_club_applications"),
    "communications unchanged",
  );

  // Existing single guest RPC preserved
  const guestRpc = read(
    "supabase/migrations/20260828120000_guest_application_fields.sql",
  );
  assert(
    guestRpc.includes("create_guest_application(p_payload jsonb)"),
    "legacy single guest RPC migration remains",
  );

  return "ok";
}
