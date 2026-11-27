/**
 * CL Release 6 PDF E2E seed — DISPOSABLE LOCAL Supabase only.
 *
 * Seeds the complete Release-6 matrix with synthetic tournaments only.
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

const REALISTIC_LEGACY_NAMES = [
  { clubName: "FC Nöttingen", teamName: "FC Nöttingen U15" },
  { clubName: "SG Sonnenhof Großaspach", teamName: "SG Sonnenhof Großaspach U15" },
  { clubName: "SV Böblingen", teamName: "SV Böblingen U15" },
  { clubName: "SSV Reutlingen U15", teamName: "U15" },
  { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim I" },
  { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim II" },
];

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

async function ensureTournament(slug, name, ageGroup, playFormat = null) {
  const existing = await db.from("tournaments").select("id").eq("slug", slug).maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const inserted = await db
    .from("tournaments")
    .insert({ slug, name, age_group: ageGroup, date: "2026-12-28", location: "Sporthalle Kirchheim/Teck", description: "Synthetisches Testturnier für den PDF-Generator. Diese vollständige Beschreibung wird dynamisch in das Dokument übernommen.", start_time: "09:00", play_format: playFormat })
    .select("id")
    .single();
  if (inserted.error) fail(`tournament insert failed (${slug}): ${inserted.error.message}`);
  return inserted.data.id;
}

async function seedScenario({
  slug,
  name,
  ageGroup,
  teamCount,
  fieldCount,
  matchesPerTeam,
  cutoff,
  champions,
  groupCount = 1,
  playFormat = null,
  competitionFormat,
  completedFraction = 0,
  teamNames = [],
  seedKnockout = false,
}) {
  const tournamentId = await ensureTournament(slug, name, ageGroup, playFormat);

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
    const legacyName = teamNames[i];
    const ins = await db
      .from("applications")
      .insert({
        tournament_id: tournamentId,
        status: "accepted",
        club_name: legacyName?.clubName ?? `Testverein ${i + 1}`,
        team_name: legacyName?.teamName ?? `${ageGroup} Mannschaft ${i + 1}`,
        age_group: ageGroup,
        contact_email: `cl6-${slug}-${i + 1}@example.test`,
        contact_first_name: `Team ${i + 1}`,
      })
      .select("id")
      .single();
    if (ins.error) fail(`application insert failed: ${ins.error.message}`);
    appIds.push(ins.data.id);
  }

  const base = Date.parse("2026-12-28T08:00:00.000Z"); // 09:00 Berlin
  const slotMinutes = 15;
  const rows = [];
  let sort = 0;
  let slot = 0;
  const teamsPerGroup = teamCount / groupCount;
  if (!Number.isInteger(teamsPerGroup) || teamsPerGroup % 2 !== 0 || matchesPerTeam >= teamsPerGroup) {
    fail(`invalid group matrix for ${slug}`);
  }
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const groupIns = await db.from("tournament_groups").insert({ tournament_id: tournamentId, name: champions ? "Liga" : `Gruppe ${String.fromCharCode(65 + groupIndex)}`, sort_order: groupIndex }).select("id").single();
    if (groupIns.error) fail(`group insert failed: ${groupIns.error.message}`);
    const groupId = groupIns.data.id;
    const groupApps = appIds.slice(groupIndex * teamsPerGroup, (groupIndex + 1) * teamsPerGroup);
    for (const appId of groupApps) {
      const mem = await db.from("tournament_group_members").insert({ group_id: groupId, application_id: appId }).select("id").single();
      if (mem.error) fail(`member insert failed: ${mem.error.message}`);
    }
    const rounds = roundRobinRounds(teamsPerGroup).slice(0, matchesPerTeam);
    for (const round of rounds) {
      round.forEach((pair, indexInRound) => {
        const fieldIndex = indexInRound % fieldCount;
        const when = new Date(base + (slot + Math.floor(indexInRound / fieldCount)) * slotMinutes * 60_000).toISOString();
        const completed = rows.length / ((teamCount * matchesPerTeam) / 2) < completedFraction;
        rows.push({
          tournament_id: tournamentId,
          group_id: groupId,
          field_id: fieldIds[fieldIndex],
          home_application_id: groupApps[pair[0]],
          away_application_id: groupApps[pair[1]],
          scheduled_at: when,
          duration_minutes: 12,
          status: completed ? "completed" : "scheduled",
          home_score: completed ? (sort % 4) : null,
          away_score: completed ? ((sort + 1) % 3) : null,
          phase: "group",
          sort_order: sort,
        });
        sort += 1;
      });
      slot += Math.ceil(round.length / fieldCount);
    }
  }
  const matchInsert = await db.from("tournament_matches").insert(rows).select("id");
  if (matchInsert.error) fail(`match insert failed: ${matchInsert.error.message}`);

  if (seedKnockout) {
    const knockoutRounds = cutoff === 16
      ? [
          ...Array(8).fill("round-of-16"),
          ...Array(4).fill("quarterfinal"),
          ...Array(2).fill("semifinal"),
          "third-place",
          "final",
        ]
      : cutoff === 8
        ? [...Array(4).fill("quarterfinal"), ...Array(2).fill("semifinal"), "third-place", "final"]
        : [...Array(2).fill("semifinal"), "third-place", "final"];
    const waveByRound = new Map([
      ["round-of-16", 0],
      ["quarterfinal", 1],
      ["semifinal", 2],
      ["third-place", 3],
      ["final", 3],
    ]);
    const waveOffsets = [0, 4, 7, 10];
    const indexInWave = new Map();
    const knockoutRows = knockoutRounds.map((round, index) => {
      const wave = waveByRound.get(round) ?? 0;
      const waveIndex = indexInWave.get(wave) ?? 0;
      indexInWave.set(wave, waveIndex + 1);
      return {
        tournament_id: tournamentId,
        group_id: null,
        field_id: fieldIds[waveIndex % fieldCount],
        home_application_id: null,
        away_application_id: null,
        scheduled_at: new Date(base + (slot + 2 + waveOffsets[wave] + Math.floor(waveIndex / fieldCount)) * slotMinutes * 60_000).toISOString(),
        duration_minutes: 12,
        status: "scheduled",
        home_score: null,
        away_score: null,
        phase: "knockout",
        round,
        sort_order: 100 + index,
      };
    });
    const knockoutInsert = await db.from("tournament_matches").insert(knockoutRows).select("id");
    if (knockoutInsert.error) fail(`knockout insert failed: ${knockoutInsert.error.message}`);
  }

  {
    const upd = await db
      .from("tournaments")
      .update(champions
        ? { competition_format: "champions-league", knockout_cutoff: cutoff, league_matches_per_team: matchesPerTeam }
        : { competition_format: competitionFormat === undefined ? (groupCount > 1 ? "groups-knockout" : "round-robin") : competitionFormat })
      .eq("id", tournamentId)
      .select("id")
      .single();
    if (upd.error) fail(`tournament config update failed: ${upd.error.message}`);
  }
  return { slug, expectedMatches: rows.length };
}

const seeded = [];
seeded.push(await seedScenario({ slug: "cl6-pdf-cl-single", name: "CL 10 Teams – ein Feld", ageGroup: "U13", teamCount: 10, fieldCount: 1, matchesPerTeam: 4, cutoff: 4, champions: true }));
seeded.push(await seedScenario({ slug: "cl6-pdf-cl-10-top8", name: "CL 10 Teams – Top 8", ageGroup: "U13", teamCount: 10, fieldCount: 2, matchesPerTeam: 4, cutoff: 8, champions: true }));
seeded.push(await seedScenario({ slug: "cl6-pdf-cl-two", name: "CL 16 Teams – zwei Felder", ageGroup: "U14", teamCount: 16, fieldCount: 2, matchesPerTeam: 8, cutoff: 8, champions: true }));
seeded.push(await seedScenario({ slug: "cl6-pdf-cl-three", name: "CL 18 Teams – drei Felder", ageGroup: "U15", teamCount: 18, fieldCount: 3, matchesPerTeam: 5, cutoff: 16, champions: true, teamNames: REALISTIC_LEGACY_NAMES, seedKnockout: true }));
seeded.push(await seedScenario({ slug: "cl6-matrix-18x8", name: "CL Matrix 18 × 8", ageGroup: "U16", teamCount: 18, fieldCount: 3, matchesPerTeam: 8, cutoff: 16, champions: true }));
seeded.push(await seedScenario({ slug: "cl6-pdf-groups", name: "Klassisches Turnier mit zwei Gruppen", ageGroup: "F-Jugend", teamCount: 8, fieldCount: 2, matchesPerTeam: 3, cutoff: null, champions: false, groupCount: 2 }));
seeded.push(await seedScenario({ slug: "cl6-pdf-bambini", name: "Bambini-Kinderfestival", ageGroup: "Bambini", teamCount: 8, fieldCount: 1, matchesPerTeam: 3, cutoff: null, champions: false, groupCount: 2, playFormat: "Kinderfestival ohne Ergebnisse und Tabelle" }));
seeded.push(await seedScenario({ slug: "cl61-pdf-groups-only", name: "Klassisches Gruppenturnier ohne Endrunde", ageGroup: "E-Jugend", teamCount: 8, fieldCount: 2, matchesPerTeam: 3, cutoff: null, champions: false, groupCount: 2, competitionFormat: "round-robin" }));
seeded.push(await seedScenario({ slug: "cl61-pdf-legacy-one-group", name: "Legacy-Turnier mit Endrunde", ageGroup: "D-Jugend", teamCount: 8, fieldCount: 1, matchesPerTeam: 3, cutoff: null, champions: false, competitionFormat: null, teamNames: REALISTIC_LEGACY_NAMES, seedKnockout: true }));
seeded.push(await seedScenario({ slug: "cl61-pdf-partial", name: "CL mit teilweise gespielter Ligaphase", ageGroup: "U13", teamCount: 10, fieldCount: 1, matchesPerTeam: 4, cutoff: 4, champions: true, completedFraction: 0.5 }));
seeded.push(await seedScenario({ slug: "cl61-pdf-complete", name: "CL mit vollstÃ¤ndiger Ligaphase", ageGroup: "U13", teamCount: 10, fieldCount: 1, matchesPerTeam: 4, cutoff: 4, champions: true, completedFraction: 1 }));

console.log(`ci-seed-r6-pdf ok: ${seeded.map((entry) => `${entry.slug}:${entry.expectedMatches}`).join(", ")}`);
