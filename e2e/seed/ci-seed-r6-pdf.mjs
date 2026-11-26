/**
 * CL Release 6 PDF E2E seed — DISPOSABLE LOCAL Supabase only.
 *
 * Seeds three already-applied synthetic tournaments so the PDF generator can be
 * rendered deterministically for all three reference layouts:
 *   cl6-pdf-cl-single  — Champions League, 1 field  (Layout A)
 *   cl6-pdf-cl-multi   — Champions League, 3 fields (Layout B)
 *   cl6-pdf-groups     — classic round-robin group  (Layout C)
 * All identities are synthetic. Refuses any non-local Supabase URL.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function fail(message) {
  throw new Error(`ci-seed-r6-pdf: ${message}`);
}

const parsed = new URL(url || "http://x");
if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321") {
  fail("refusing non-local Supabase URL");
}
if (/ogopebvpojuvheimzged|supabase\.co/i.test(url)) fail("hosted Supabase reference detected");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is required (local only)");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function roundRobinRounds(n) {
  const arr = [...Array(n).keys()];
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const round = [];
    for (let i = 0; i < n / 2; i += 1) round.push([arr[i], arr[n - 1 - i]]);
    rounds.push(round);
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, arr[0], ...rest);
  }
  return rounds;
}

async function ensureTournament(slug, name, ageGroup) {
  const existing = await db.from("tournaments").select("id").eq("slug", slug).maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const inserted = await db
    .from("tournaments")
    .insert({ slug, name, age_group: ageGroup, date: "2026-12-28", location: "Sporthalle Kirchheim/Teck", description: "Synthetisches Testturnier für den PDF-Generator.", start_time: "09:00" })
    .select("id")
    .single();
  if (inserted.error) fail(`tournament insert failed (${slug}): ${inserted.error.message}`);
  return inserted.data.id;
}

async function seedScenario({ slug, name, ageGroup, teamCount, fieldCount, matchesPerTeam, cutoff, champions }) {
  const tournamentId = await ensureTournament(slug, name, ageGroup);

  const already = await db.from("tournament_matches").select("id").eq("tournament_id", tournamentId).limit(1);
  if (already.data && already.data.length > 0) return slug; // idempotent

  const fieldIds = [];
  for (let i = 0; i < fieldCount; i += 1) {
    const ins = await db.from("tournament_fields").insert({ tournament_id: tournamentId, name: `Platz ${i + 1}`, sort_order: i }).select("id").single();
    if (ins.error) fail(`field insert failed: ${ins.error.message}`);
    fieldIds.push(ins.data.id);
  }

  const appIds = [];
  for (let i = 0; i < teamCount; i += 1) {
    const ins = await db
      .from("applications")
      .insert({ tournament_id: tournamentId, status: "accepted", contact_email: `cl6-${slug}-${i + 1}@example.test`, contact_first_name: `Team ${i + 1}` })
      .select("id")
      .single();
    if (ins.error) fail(`application insert failed: ${ins.error.message}`);
    appIds.push(ins.data.id);
  }

  const groupIns = await db.from("tournament_groups").insert({ tournament_id: tournamentId, name: champions ? "Liga" : "Gruppe A", sort_order: 0 }).select("id").single();
  if (groupIns.error) fail(`group insert failed: ${groupIns.error.message}`);
  const groupId = groupIns.data.id;
  for (const appId of appIds) {
    const mem = await db.from("tournament_group_members").insert({ group_id: groupId, application_id: appId }).select("id").single();
    if (mem.error) fail(`member insert failed: ${mem.error.message}`);
  }

  const rounds = roundRobinRounds(teamCount).slice(0, matchesPerTeam);
  const base = Date.parse("2026-12-28T08:00:00.000Z"); // 09:00 Berlin
  const slotMinutes = 15;
  const rows = [];
  let sort = 0;
  let slot = 0;
  for (const round of rounds) {
    round.forEach((pair, indexInRound) => {
      const fieldIndex = indexInRound % fieldCount;
      const when = new Date(base + (slot + Math.floor(indexInRound / fieldCount)) * slotMinutes * 60_000).toISOString();
      rows.push({
        tournament_id: tournamentId,
        group_id: groupId,
        field_id: fieldIds[fieldIndex],
        home_application_id: appIds[pair[0]],
        away_application_id: appIds[pair[1]],
        scheduled_at: when,
        duration_minutes: 12,
        status: "scheduled",
        phase: "group",
        sort_order: sort,
      });
      sort += 1;
    });
    slot += Math.ceil(round.length / fieldCount);
  }
  const matchInsert = await db.from("tournament_matches").insert(rows).select("id");
  if (matchInsert.error) fail(`match insert failed: ${matchInsert.error.message}`);

  if (champions) {
    const upd = await db
      .from("tournaments")
      .update({ competition_format: "champions-league", knockout_cutoff: cutoff, league_matches_per_team: matchesPerTeam })
      .eq("id", tournamentId)
      .select("id")
      .single();
    if (upd.error) fail(`tournament config update failed: ${upd.error.message}`);
  }
  return slug;
}

await seedScenario({ slug: "cl6-pdf-cl-single", name: "B-Jugend Hallenturnier (Champions League, 1 Feld)", ageGroup: "B-Jugend", teamCount: 6, fieldCount: 1, matchesPerTeam: 3, cutoff: 4, champions: true });
await seedScenario({ slug: "cl6-pdf-cl-multi", name: "U13 Soccer Cup (Champions League, 3 Felder)", ageGroup: "U13", teamCount: 8, fieldCount: 3, matchesPerTeam: 3, cutoff: 8, champions: true });
await seedScenario({ slug: "cl6-pdf-groups", name: "E-Jugend Gruppenturnier", ageGroup: "E-Jugend", teamCount: 6, fieldCount: 2, matchesPerTeam: 5, cutoff: null, champions: false });

console.log("ci-seed-r6-pdf ok: cl6-pdf-cl-single, cl6-pdf-cl-multi, cl6-pdf-groups applied.");
