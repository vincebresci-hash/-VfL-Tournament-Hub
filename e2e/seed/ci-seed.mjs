/**
 * CL Release 5 E2E seed — DISPOSABLE LOCAL Supabase only (GitHub Actions).
 *
 * Creates synthetic, isolated test data: one super-admin login, two clubs, and
 * scenario B (10 accepted participants × 3 fields, competition_format NULL).
 * Uses the LOCAL service-role key printed by `supabase status`. It REFUSES to
 * run against any non-local Supabase URL, so it can never touch production.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = process.env.E2E_ADMIN_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? "";
const slug = process.env.E2E_SLUG_B ?? "cl5-scenario-b";

function fail(message) {
  console.error(`ci-seed: ${message}`);
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  fail(`refusing non-local Supabase URL: ${url || "unset"}`);
}
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is required (local only)");
if (!email || !password) fail("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. Super-admin login (idempotent).
let userId = null;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  const list = await db.auth.admin.listUsers();
  userId = list.data?.users?.find((u) => u.email === email)?.id ?? null;
  if (!userId) fail(`could not create or find admin user: ${created.error.message}`);
} else {
  userId = created.data.user?.id ?? null;
}
if (!userId) fail("no admin user id");
const roleUpdate = await db.from("profiles").update({ role: "super-admin" }).eq("id", userId).select("id, role").maybeSingle();
if (roleUpdate.error || roleUpdate.data?.role !== "super-admin") {
  fail(`could not set super-admin role: ${roleUpdate.error?.message ?? "no row"}`);
}

// 2. Two clubs for inline assignment (idempotent by name).
for (const name of ["VfL Kirchheim", "TSV Beispiel"]) {
  const existing = await db.from("clubs").select("id").eq("name", name).maybeSingle();
  if (!existing.data) {
    const ins = await db.from("clubs").insert({ name }).select("id");
    if (ins.error) fail(`club insert failed (${name}): ${ins.error.message}`);
  }
}

// 3. Scenario B tournament (competition_format defaults NULL = legacy).
let tournament = await db.from("tournaments").select("id").eq("slug", slug).maybeSingle();
let tournamentId = tournament.data?.id ?? null;
if (!tournamentId) {
  const ins = await db
    .from("tournaments")
    .insert({ slug, name: "CL5 Szenario B (synthetisch)", age_group: "U13", date: "2026-12-27" })
    .select("id")
    .single();
  if (ins.error) fail(`tournament insert failed: ${ins.error.message}`);
  tournamentId = ins.data.id;
}

// 4. 10 accepted participants (no club → exercises the assignment workflow).
const apps = await db.from("applications").select("id").eq("tournament_id", tournamentId).eq("status", "accepted");
const haveApps = apps.data?.length ?? 0;
if (haveApps < 10) {
  const rows = Array.from({ length: 10 - haveApps }, (_, i) => ({
    tournament_id: tournamentId,
    status: "accepted",
    contact_email: `cl5-team-${haveApps + i + 1}@example.test`,
    contact_first_name: `Team ${haveApps + i + 1}`,
  }));
  const ins = await db.from("applications").insert(rows).select("id");
  if (ins.error) fail(`application insert failed: ${ins.error.message}`);
}

// 5. Three fields.
const fields = await db.from("tournament_fields").select("id").eq("tournament_id", tournamentId);
const haveFields = fields.data?.length ?? 0;
if (haveFields < 3) {
  const rows = Array.from({ length: 3 - haveFields }, (_, i) => ({
    tournament_id: tournamentId,
    name: `Platz ${haveFields + i + 1}`,
    sort_order: haveFields + i,
  }));
  const ins = await db.from("tournament_fields").insert(rows).select("id");
  if (ins.error) fail(`field insert failed: ${ins.error.message}`);
}

console.log(`ci-seed ok: admin=${email} (super-admin), tournament=${slug} (${tournamentId}), 10 accepted teams, 3 fields, 2 clubs.`);
