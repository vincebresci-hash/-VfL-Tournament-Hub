/**
 * CL Release 5 E2E seed — DISPOSABLE LOCAL Supabase only.
 *
 * Creates one independent assigned and one independent unassigned ten-team
 * tournament per Playwright viewport. Desktop/mobile can therefore run in
 * parallel without racing on the same schedule. All identities are synthetic.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = process.env.E2E_ADMIN_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? "";
const slugPrefix = process.env.E2E_SLUG_B ?? "cl5-scenario-b";

function fail(message) {
  throw new Error(`ci-seed: ${message}`);
}

const parsedUrl = new URL(url);
if (
  parsedUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(parsedUrl.hostname) ||
  parsedUrl.port !== "54321"
) {
  fail("refusing non-local Supabase URL");
}
if (/ogopebvpojuvheimzged|supabase\.co/i.test(url)) fail("hosted Supabase reference detected");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is required (local only)");
if (!email || !password) fail("synthetic E2E admin credentials are required");
if (!/^[a-z0-9-]+$/.test(slugPrefix)) fail("invalid synthetic slug prefix");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = null;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  const list = await db.auth.admin.listUsers();
  userId = list.data?.users?.find((user) => user.email === email)?.id ?? null;
  if (!userId) fail(`could not create or find synthetic admin: ${created.error.message}`);
} else {
  userId = created.data.user?.id ?? null;
}
if (!userId) fail("synthetic admin has no user id");
const roleUpdate = await db
  .from("profiles")
  .update({ role: "super-admin", is_active: true })
  .eq("id", userId)
  .select("id, role")
  .maybeSingle();
if (roleUpdate.error || roleUpdate.data?.role !== "super-admin") {
  fail(`could not set synthetic admin role: ${roleUpdate.error?.message ?? "no profile"}`);
}

async function ensureClub(name) {
  const existing = await db.from("clubs").select("id").eq("name", name).maybeSingle();
  if (existing.error) fail(`club lookup failed (${name}): ${existing.error.message}`);
  if (existing.data?.id) return existing.data.id;
  const inserted = await db.from("clubs").insert({ name }).select("id").single();
  if (inserted.error) fail(`club insert failed (${name}): ${inserted.error.message}`);
  return inserted.data.id;
}

const blueClubId = await ensureClub("Blue Test Club");
const yellowClubId = await ensureClub("Yellow Test Club");

async function ensureTournament(slug, name) {
  const existing = await db.from("tournaments").select("id").eq("slug", slug).maybeSingle();
  if (existing.error) fail(`tournament lookup failed (${slug}): ${existing.error.message}`);
  if (existing.data?.id) return existing.data.id;
  const inserted = await db
    .from("tournaments")
    .insert({ slug, name, age_group: "U13", date: "2026-12-27" })
    .select("id")
    .single();
  if (inserted.error) fail(`tournament insert failed (${slug}): ${inserted.error.message}`);
  return inserted.data.id;
}

async function ensureScenario({ slug, assigned }) {
  const tournamentId = await ensureTournament(
    slug,
    `${assigned ? "CL5 20/20" : "CL5 Club-Fail-safe"} (${slug.endsWith("mobile") ? "Mobile" : "Desktop"})`,
  );

  const existingApplications = await db
    .from("applications")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "accepted");
  if (existingApplications.error) fail(`application lookup failed (${slug}): ${existingApplications.error.message}`);
  const existingCount = existingApplications.data?.length ?? 0;
  if (existingCount < 10) {
    const rows = Array.from({ length: 10 - existingCount }, (_, offset) => {
      const index = existingCount + offset;
      const blue = index % 2 === 0;
      const teamName = assigned
        ? `${blue ? "Blue" : "Yellow"} Team ${String(index + 1).padStart(2, "0")}`
        : `Unassigned Team ${String(index + 1).padStart(2, "0")}`;
      return {
        tournament_id: tournamentId,
        status: "accepted",
        contact_email: `${slug}-team-${index + 1}@example.test`,
        contact_first_name: teamName,
        team_name: teamName,
        club_name: assigned ? (blue ? "Blue Test Club" : "Yellow Test Club") : null,
        club_id: assigned ? (blue ? blueClubId : yellowClubId) : null,
      };
    });
    const inserted = await db.from("applications").insert(rows).select("id");
    if (inserted.error) fail(`application insert failed (${slug}): ${inserted.error.message}`);
  }

  const existingFields = await db.from("tournament_fields").select("id").eq("tournament_id", tournamentId);
  if (existingFields.error) fail(`field lookup failed (${slug}): ${existingFields.error.message}`);
  const fieldCount = existingFields.data?.length ?? 0;
  if (fieldCount < 3) {
    const rows = Array.from({ length: 3 - fieldCount }, (_, offset) => ({
      tournament_id: tournamentId,
      name: `Platz ${fieldCount + offset + 1}`,
      sort_order: fieldCount + offset,
    }));
    const inserted = await db.from("tournament_fields").insert(rows).select("id");
    if (inserted.error) fail(`field insert failed (${slug}): ${inserted.error.message}`);
  }
}

for (const viewport of ["desktop", "mobile"]) {
  await ensureScenario({ slug: `${slugPrefix}-${viewport}`, assigned: true });
  await ensureScenario({ slug: `${slugPrefix}-missing-${viewport}`, assigned: false });
}

console.log("ci-seed ok: synthetic admin, 2 synthetic clubs, 4 isolated ten-team tournaments, 3 fields each");
