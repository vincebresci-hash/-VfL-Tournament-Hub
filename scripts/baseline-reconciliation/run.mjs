/**
 * Idempotence and preservation test for the production baseline reconciliation.
 * The test creates a disposable loopback-only PostgreSQL 17 cluster, replays the
 * 66 immutable historical migrations, applies the two reconciliation files,
 * seeds synthetic production-like data, reapplies both files, and verifies that
 * data and customized templates are unchanged.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openClient, startDisposableCluster } from "../competition-postgres/cluster.mjs";
import { prepareDatabase } from "../competition-postgres/apply.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const historicalEnd = "20261009150000_ionos_inbox_readonly.sql";
const reconciliationFile = path.join(
  repoRoot,
  "supabase/migrations/20261120120000_production_baseline_reconciliation.sql",
);
const templateFile = path.join(
  repoRoot,
  "supabase/migrations/20261120121000_production_participation_recovery_template.sql",
);
const expectedFunctionHashes = new Map([
  ["activate_participation_access_recovery_token(text)", "e3124bff2b468034d255f1858d2de328"],
  ["discard_participation_access_recovery_token(text)", "e3e07910f131f9cddcd940284f12ee0d"],
  ["participation_recovery_token_expires_at(date)", "72f1b6f02e04eca234efd0fff84bcaca"],
  ["rotate_participation_cancellation_token(uuid,text,timestamp with time zone)", "dd5b94e123842eb89048a47e36a87809"],
  ["stage_participation_access_recovery_token(uuid,text,text,text,text)", "cf8faad8eac463b87a1d34fc9b6a044a"],
  ["has_rbac_permission(text,uuid,uuid)", "0254b0000633820677bd949837d30943"],
  ["issue_guest_cancellation_recovery_token(uuid,text,text,text,text,text,text,text)", "8c9f6063b9801881621d6aafd3cbeb9a"],
  ["set_tournament_partner_assignments(uuid,uuid[])", "50261435dd4c058be58abf7f7ae84f81"],
  ["sync_mein_turnierplan_tournament(uuid,jsonb,boolean)", "243dda3340b4f4d016946d43cbeecac7"],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function applyFile(client, filename) {
  await client.query(readFileSync(filename, "utf8"));
}

async function snapshot(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT jsonb_build_object(
       'auth_users', (SELECT count(*) FROM auth.users),
       'profiles', (SELECT count(*) FROM public.profiles),
       'tournaments', (SELECT count(*) FROM public.tournaments),
       'applications', (SELECT count(*) FROM public.applications),
       'matches', (SELECT count(*) FROM public.tournament_matches),
       'fixture', (
         SELECT jsonb_build_object(
           'slug', t.slug,
           'format', to_jsonb(t)->'competition_format',
           'applications', (
             SELECT jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status) ORDER BY a.id)
             FROM public.applications a WHERE a.tournament_id = t.id
           ),
           'results', (
             SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'home', m.home_score, 'away', m.away_score, 'status', m.status
             ) ORDER BY m.id)
             FROM public.tournament_matches m WHERE m.tournament_id = t.id
           )
         )
         FROM public.tournaments t WHERE t.id = $1
       ),
       'templates', (
         SELECT jsonb_agg(jsonb_build_object(
           'type', type, 'name', name, 'subject', subject, 'body', body, 'active', active
         ) ORDER BY type::text, id)
         FROM public.email_templates
         WHERE type IN (
           'application-accepted'::public.email_template_type,
           'participation-access-recovery'::public.email_template_type
         )
       )
     ) AS state`,
    [tournamentId],
  );
  return rows[0].state;
}

const started = performance.now();
const checks = [];
let cluster;
try {
  cluster = await startDisposableCluster();
  await prepareDatabase(cluster, { throughFilename: historicalEnd });
  const client = openClient(cluster);
  await client.connect();
  try {
    await applyFile(client, reconciliationFile);
    await applyFile(client, templateFile);
    checks.push("initial reconciliation applied after exactly 66 historical migrations");

    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ('99999999-9999-4999-8999-999999999999', 'baseline-user@example.invalid')
      ON CONFLICT (id) DO NOTHING
    `);
    const tournament = await client.query(`
      INSERT INTO public.tournaments (slug, name, age_group, date)
      VALUES ('baseline-preservation', 'Baseline preservation', 'U13', DATE '2026-11-25')
      RETURNING id
    `);
    const tournamentId = tournament.rows[0].id;
    const home = await client.query(
      `INSERT INTO public.applications (tournament_id, status, contact_email)
       VALUES ($1, 'accepted', 'baseline-home@example.invalid') RETURNING id`,
      [tournamentId],
    );
    const away = await client.query(
      `INSERT INTO public.applications (tournament_id, status, contact_email)
       VALUES ($1, 'accepted', 'baseline-away@example.invalid') RETURNING id`,
      [tournamentId],
    );
    await client.query(
      `INSERT INTO public.tournament_matches (
         tournament_id, phase, status, home_application_id, away_application_id, home_score, away_score
       ) VALUES ($1, 'group', 'completed', $2, $3, 3, 1)`,
      [tournamentId, home.rows[0].id, away.rows[0].id],
    );
    await client.query(`
      UPDATE public.email_templates
      SET subject = 'CUSTOM ACCEPTED SUBJECT', body = 'CUSTOM ACCEPTED BODY'
      WHERE type = 'application-accepted'::public.email_template_type
    `);
    await client.query(`
      UPDATE public.email_templates
      SET subject = 'CUSTOM RECOVERY SUBJECT', body = 'CUSTOM RECOVERY BODY'
      WHERE type = 'participation-access-recovery'::public.email_template_type
    `);

    const before = await snapshot(client, tournamentId);
    await applyFile(client, reconciliationFile);
    await applyFile(client, templateFile);
    const after = await snapshot(client, tournamentId);
    invariant(JSON.stringify(after) === JSON.stringify(before), "Reconciliation changed business or template data");
    checks.push("reapply preserved users, tournaments, applications, result and customized templates");

    const functions = await client.query(`
      SELECT p.oid::regprocedure::text AS signature,
             md5(regexp_replace(p.prosrc, '\\s+', '', 'g')) AS body_hash
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.oid::regprocedure::text = ANY($1::text[])
      ORDER BY signature
    `, [[...expectedFunctionHashes.keys()]]);
    invariant(functions.rows.length === expectedFunctionHashes.size, "Versioned function set is incomplete");
    for (const row of functions.rows) {
      invariant(
        expectedFunctionHashes.get(row.signature) === row.body_hash,
        `Function fingerprint mismatch: ${row.signature}`,
      );
    }
    checks.push("all nine versioned production function bodies match reviewed fingerprints");

    const dangerous = await client.query(`
      SELECT count(*)::integer AS grants
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))
      ) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND r.rolname IN ('anon', 'authenticated')
        AND a.privilege_type IN ('MAINTAIN', 'REFERENCES', 'TRIGGER', 'TRUNCATE')
    `);
    invariant(dangerous.rows[0].grants === 0, "Dangerous client-role table grants remain");
    checks.push("dangerous anon/authenticated table privileges removed");

    const templateCount = await client.query(`
      SELECT count(*)::integer AS rows
      FROM public.email_templates
      WHERE type = 'participation-access-recovery'::public.email_template_type
    `);
    invariant(templateCount.rows[0].rows === 1, "Recovery template is not unique after replay");
    checks.push("recovery template seed is idempotent");
  } finally {
    await client.end();
  }

  for (const check of checks) console.log(`PASS\t${check}`);
  console.log(
    `BASELINE_RECONCILIATION_RESULT ${JSON.stringify({
      status: "PASS",
      checks: checks.length,
      postgres: cluster.version,
      durationMs: Math.round(performance.now() - started),
    })}`,
  );
} catch (error) {
  console.error(`BASELINE_RECONCILIATION_RESULT ${JSON.stringify({ status: "FAIL", error: error.message })}`);
  process.exitCode = 1;
} finally {
  cluster?.stop();
}
