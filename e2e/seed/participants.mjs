/**
 * CL Release 5 E2E seed helper — LOCAL ONLY.
 *
 * Adds synthetic accepted participants and fields to an existing (UI-created)
 * tournament on the LOCAL Supabase stack, using the service-role key from the
 * environment. It REFUSES to run against a non-local Supabase URL.
 *
 * Usage:
 *   node e2e/seed/participants.mjs <slug> --teams 10 --fields 3 [--club "VfL Kirchheim"]
 *
 * Columns used mirror the Champions League apply contract test
 * (supabase/tests/apply_champions_league_league_phase.sql): accepted
 * applications need only (tournament_id, status, contact_email[, club_id]) and
 * fields need (tournament_id, name, sort_order).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error(`Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is not local (${url || "unset"}).`);
  process.exit(1);
}
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required (local stack only).");
  process.exit(1);
}

const [, , slug, ...rest] = process.argv;
if (!slug) {
  console.error("Usage: node e2e/seed/participants.mjs <slug> --teams N --fields N [--club NAME]");
  process.exit(1);
}
function flag(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}
const teams = Number(flag("teams", "10"));
const fields = Number(flag("fields", "3"));
const clubName = flag("club", null);

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: tournament, error: tErr } = await db
  .from("tournaments")
  .select("id, slug")
  .eq("slug", slug)
  .maybeSingle();
if (tErr || !tournament) {
  console.error(`Tournament '${slug}' not found. Create it via /admin/turniere/neu first.`, tErr ?? "");
  process.exit(1);
}

let clubId = null;
if (clubName) {
  const existing = await db.from("clubs").select("id").eq("name", clubName).maybeSingle();
  clubId = existing.data?.id ?? (await db.from("clubs").insert({ name: clubName }).select("id").single()).data?.id ?? null;
}

const apps = Array.from({ length: teams }, (_, i) => ({
  tournament_id: tournament.id,
  status: "accepted",
  contact_email: `cl5-seed-${i + 1}@example.invalid`,
  club_id: clubId, // leave null to exercise the missing-club workflow
}));
const insertedApps = await db.from("applications").insert(apps).select("id");
if (insertedApps.error) {
  console.error("Failed to insert applications:", insertedApps.error);
  process.exit(1);
}

const fieldRows = Array.from({ length: fields }, (_, i) => ({
  tournament_id: tournament.id,
  name: `Platz ${i + 1}`,
  sort_order: i,
}));
const insertedFields = await db.from("tournament_fields").insert(fieldRows).select("id");
if (insertedFields.error) {
  console.error("Failed to insert fields:", insertedFields.error);
  process.exit(1);
}

console.log(
  `Seeded '${slug}': ${insertedApps.data.length} accepted participants, ${insertedFields.data.length} fields` +
    (clubName ? `, club '${clubName}'` : ", no club (missing-club workflow)"),
);
