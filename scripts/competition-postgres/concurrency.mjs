/**
 * Two-connection concurrency tests. A comment is not a result.
 * Each scenario records the waiter, both outcomes, and the committed rows.
 */
import { openClient } from "./cluster.mjs";

const MANAGER = "11111111-1111-4111-8111-111111111111";

function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect(cluster) {
  const client = openClient(cluster);
  await client.connect();
  return client;
}

async function begin(client, lockTimeout = "8s", statementTimeout = "15s") {
  await client.query("BEGIN");
  await client.query(`SET LOCAL lock_timeout = '${lockTimeout}'`);
  await client.query(`SET LOCAL statement_timeout = '${statementTimeout}'`);
  await client.query("SET LOCAL deadlock_timeout = '200ms'");
}

async function waitForQuery(watch, snippet) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { rows } = await watch.query(
      `SELECT count(*)::integer AS n
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND query LIKE $1`,
      [`%${snippet}%`],
    );
    if (rows[0].n > 0) return;
    await sleep(30);
  }
  throw new Error(`timed out waiting for query containing ${snippet}`);
}

async function observeLock(watch) {
  const samples = [];
  const deadline = Date.now() + 1600;
  while (Date.now() < deadline) {
    const { rows } = await watch.query(
      `SELECT COALESCE(wait_event_type, '') AS wait_type,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND state = 'active'`,
    );
    samples.push(rows);
    if (rows.some((row) => row.wait_type === "Lock")) {
      return { locked: true, waiter: rows.find((row) => row.wait_type === "Lock") };
    }
    await sleep(25);
  }
  return { locked: false, samples };
}

async function tournament(client, slug) {
  const { rows } = await client.query(
    `INSERT INTO public.tournaments (slug, name, age_group, date)
     VALUES ($1, $1, 'U13', DATE '2026-11-21')
     RETURNING id, updated_at::text AS updated_at`,
    [slug],
  );
  return rows[0];
}

async function save(client, tournamentId, expectedAt, format, matches, cutoff) {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MANAGER]);
  const { rows } = await client.query(
    `SELECT public.save_competition_configuration($1, $2, $3, $4, $5) AS result`,
    [tournamentId, expectedAt, format, matches, cutoff],
  );
  return rows[0].result;
}

function resultCode(payload) {
  return payload && typeof payload === "object" ? payload.code ?? payload.status ?? null : null;
}

async function record(client, name, status, detail) {
  await client.query(
    `INSERT INTO public.test_results (suite, name, ok, detail) VALUES ('concurrency', $1, $2, $3)`,
    [name, status === "PASS", detail],
  );
}

export async function runConcurrency(cluster) {
  const setup = await connect(cluster);
  const results = [];
  try {
    await setup.query(`
      CREATE TABLE IF NOT EXISTS public.concurrency_obs (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        scenario text NOT NULL,
        actor text NOT NULL,
        payload text NOT NULL
      )
    `);
    const fixtures = await createFixtures(setup);
    await setup.end();

    const cases = [
      () => twoSaves(cluster, fixtures),
      () => acceptApplication(cluster, fixtures),
      () => revokeApplication(cluster, fixtures),
      () => confirmExternal(cluster, fixtures),
      () => deactivateExternal(cluster, fixtures),
      () => linkExternal(cluster, fixtures),
      () => createGroup(cluster, fixtures),
      () => deleteGroup(cluster, fixtures),
      () => changeMembership(cluster, fixtures),
      () => insertMatch(cluster, fixtures),
      () => deleteMatch(cluster, fixtures),
      () => updateResult(cluster, fixtures),
      () => archiveTournament(cluster, fixtures),
      () => renameSlug(cluster, fixtures),
      () => replaceSchedule(cluster, fixtures),
      () => deleteTournament(cluster, fixtures),
      () => updateMatchRows(cluster, fixtures),
      () => moveMatch(cluster, fixtures),
      () => deadlock(cluster, fixtures),
      () => lockTimeoutRetry(cluster, fixtures),
    ];

    for (const runCase of cases) {
      const started = performance.now();
      try {
        const outcome = await runCase();
        results.push({ ...outcome, ms: Math.round(performance.now() - started) });
      } catch (error) {
        results.push({
          name: error && typeof error === "object" && "scenario" in error ? String(error.scenario) : "concurrency case",
          status: "FAIL",
          detail: error instanceof Error ? error.message : String(error),
          ms: Math.round(performance.now() - started),
        });
      }
    }
  } catch (error) {
    await setup.end().catch(() => {});
    throw error;
  }

  const reporter = await connect(cluster);
  try {
    for (const result of results) {
      await record(reporter, result.name, result.status, result.detail);
    }
  } finally {
    await reporter.end();
  }
  return results;
}

async function createFixtures(client) {
  async function acceptedPair(slug) {
    const row = await tournament(client, slug);
    const home = await client.query(
      `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'accepted') RETURNING id`,
      [row.id],
    );
    const away = await client.query(
      `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'accepted') RETURNING id`,
      [row.id],
    );
    return { ...row, home: home.rows[0].id, away: away.rows[0].id };
  }

  const twoSaves = await tournament(client, "concurrency-two-saves");
  const accept = await tournament(client, "concurrency-accept");
  const accepted = await client.query(
    `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'accepted') RETURNING id`,
    [accept.id],
  );
  const pending = await client.query(
    `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'new') RETURNING id`,
    [accept.id],
  );
  const revoke = await acceptedPair("concurrency-revoke");
  const confirm = await tournament(client, "concurrency-confirm");
  const confirmApp = await client.query(
    `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'accepted') RETURNING id`,
    [confirm.id],
  );
  const confirmExt = await client.query(
    `INSERT INTO public.tournament_external_teams (tournament_id, external_id, name, participation_status)
     VALUES ($1, 'confirm-ext', 'Confirm me', 'detected') RETURNING id`,
    [confirm.id],
  );
  const deactivate = await tournament(client, "concurrency-deactivate");
  const keep = await client.query(
    `INSERT INTO public.tournament_external_teams
       (tournament_id, external_id, name, participation_status, external_active)
     VALUES ($1, 'keep', 'Keep', 'confirmed', true) RETURNING id`,
    [deactivate.id],
  );
  await client.query(
    `INSERT INTO public.tournament_external_teams
       (tournament_id, external_id, name, participation_status, external_active)
     VALUES ($1, 'drop', 'Drop', 'confirmed', true)`,
    [deactivate.id],
  );
  const link = await tournament(client, "concurrency-link");
  const linkAccepted = await client.query(
    `INSERT INTO public.applications (tournament_id, status) VALUES ($1, 'accepted') RETURNING id`,
    [link.id],
  );
  const linkExt = await client.query(
    `INSERT INTO public.tournament_external_teams
       (tournament_id, external_id, name, participation_status, external_active)
     VALUES ($1, 'link-ext', 'Linker', 'confirmed', true) RETURNING id`,
    [link.id],
  );
  const groupCreate = await tournament(client, "concurrency-group-create");
  const groupDelete = await tournament(client, "concurrency-group-delete");
  const group = await client.query(
    `INSERT INTO public.tournament_groups (tournament_id, name) VALUES ($1, 'A') RETURNING id`,
    [groupDelete.id],
  );
  const member = await acceptedPair("concurrency-member");
  const memberGroup = await client.query(
    `INSERT INTO public.tournament_groups (tournament_id, name) VALUES ($1, 'A') RETURNING id`,
    [member.id],
  );
  const matchInsert = await acceptedPair("concurrency-match-insert");
  const matchDelete = await acceptedPair("concurrency-match-delete");
  const existingMatch = await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, home_application_id, away_application_id)
     VALUES ($1, 'group', $2, $3) RETURNING id`,
    [matchDelete.id, matchDelete.home, matchDelete.away],
  );
  const result = await acceptedPair("concurrency-result00");
  const resultMatch = await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, home_application_id, away_application_id)
     VALUES ($1, 'group', $2, $3) RETURNING id`,
    [result.id, result.home, result.away],
  );
  const archive = await tournament(client, "concurrency-archive");
  const slug = await tournament(client, "concurrency-slug");
  const replace = await tournament(client, "concurrency-replace");
  await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, round)
     VALUES ($1, 'knockout', 'semifinal'), ($1, 'knockout', 'final')`,
    [replace.id],
  );
  const deletion = await tournament(client, "concurrency-delete");
  await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, round) VALUES ($1, 'knockout', 'final')`,
    [deletion.id],
  );
  const multi = await acceptedPair("concurrency-multirow");
  await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, home_application_id, away_application_id, sort_order)
     SELECT $1, 'group', $2, $3, 0 FROM generate_series(1, 3)`,
    [multi.id, multi.home, multi.away],
  );
  const source = await tournament(client, "concurrency-cross-a");
  const destination = await tournament(client, "concurrency-cross-b");
  const moved = await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, round)
     VALUES ($1, 'knockout', 'final') RETURNING id`,
    [source.id],
  );
  const left = await tournament(client, "concurrency-deadlock-a");
  const right = await tournament(client, "concurrency-deadlock-b");
  const leftMatch = await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, round, sort_order)
     VALUES ($1, 'knockout', 'final', 0) RETURNING id`,
    [left.id],
  );
  const rightMatch = await client.query(
    `INSERT INTO public.tournament_matches (tournament_id, phase, round, sort_order)
     VALUES ($1, 'knockout', 'final', 0) RETURNING id`,
    [right.id],
  );
  const retry = await tournament(client, "concurrency-retry");

  return {
    twoSaves,
    accept: { ...accept, acceptedId: accepted.rows[0].id, pendingId: pending.rows[0].id },
    revoke,
    confirm: { ...confirm, applicationId: confirmApp.rows[0].id, externalId: confirmExt.rows[0].id },
    deactivate: { ...deactivate, keepId: keep.rows[0].id },
    link: { ...link, applicationId: linkAccepted.rows[0].id, externalId: linkExt.rows[0].id },
    groupCreate,
    groupDelete: { ...groupDelete, groupId: group.rows[0].id },
    member: { ...member, groupId: memberGroup.rows[0].id },
    matchInsert,
    matchDelete: { ...matchDelete, matchId: existingMatch.rows[0].id },
    result: { ...result, matchId: resultMatch.rows[0].id },
    archive,
    slug,
    replace,
    deletion,
    multi,
    source,
    destination,
    movedMatchId: moved.rows[0].id,
    leftMatchId: leftMatch.rows[0].id,
    rightMatchId: rightMatch.rows[0].id,
    retry,
  };
}

async function overlap(cluster, spec) {
  const a = await connect(cluster);
  const b = await connect(cluster);
  const watch = await connect(cluster);
  try {
    const first = settle((async () => {
      await begin(a);
      await spec.first(a);
      await a.query("SELECT pg_sleep(1.2)");
      await a.query("COMMIT");
    })());
    const started = await Promise.race([
      waitForQuery(watch, "pg_sleep(1.2)").then(() => "sleeping"),
      first.then((result) => {
        if (!result.ok) throw result.error;
        return "finished";
      }),
    ]);
    if (started !== "sleeping") {
      throw new Error("holder finished before the lock window opened");
    }
    const lockPromise = observeLock(watch);
    const second = settle((async () => {
      await begin(b);
      const value = await spec.second(b);
      await b.query("COMMIT");
      return value;
    })());
    const [firstResult, secondResult, lock] = await Promise.all([
      first,
      second,
      lockPromise,
    ]);
    if (!firstResult.ok) {
      throw new Error(`holder failed: ${firstResult.error.message}`);
    }
    if (!secondResult.ok) {
      throw new Error(`waiter failed: ${secondResult.error.message}`);
    }
    if (!lock.locked) {
      throw Object.assign(new Error("no lock wait observed"), { scenario: spec.name });
    }
    if (spec.expectedStatus && secondResult.value?.status !== spec.expectedStatus) {
      throw Object.assign(
        new Error(`expected status ${spec.expectedStatus}, got ${JSON.stringify(secondResult.value)}`),
        { scenario: spec.name },
      );
    }
    if (spec.expectedCode && secondResult.value?.code !== spec.expectedCode) {
      throw Object.assign(
        new Error(`expected code ${spec.expectedCode}, got ${JSON.stringify(secondResult.value)}`),
        { scenario: spec.name },
      );
    }
    const state = await spec.assert(watch, secondResult.value);
    return {
      name: spec.name,
      status: "PASS",
      detail: `${state}; waiter=${lock.waiter.query}`,
    };
  } catch (error) {
    if (error && typeof error === "object" && !("scenario" in error)) {
      error.scenario = spec.name;
    }
    throw error;
  } finally {
    await Promise.all([a.end(), b.end(), watch.end()]);
  }
}

function twoSaves(cluster, fixtures) {
  return overlap(cluster, {
    name: "Two simultaneous configuration saves",
    expectedStatus: "stale_configuration",
    async first(client) {
      const result = await save(client, fixtures.twoSaves.id, fixtures.twoSaves.updated_at, "round-robin", null, null);
      if (result.status !== "success") throw new Error(`first save ${JSON.stringify(result)}`);
    },
    async second(client) {
      return save(client, fixtures.twoSaves.id, fixtures.twoSaves.updated_at, "round-robin", null, null);
    },
    async assert(client) {
      const { rows } = await client.query(
        `SELECT competition_format FROM public.tournaments WHERE id = $1`,
        [fixtures.twoSaves.id],
      );
      if (rows[0].competition_format !== "round-robin") {
        throw new Error(`format ${rows[0].competition_format}`);
      }
      return "one success then stale_configuration; format round-robin";
    },
  }).then(async (result) => result);
}

async function acceptApplication(cluster, fixtures) {
  return overlap(cluster, {
    name: "Application acceptance",
    expectedCode: "CUTOFF_EXCEEDS_TEAMS",
    async first(client) {
      await client.query(`UPDATE public.applications SET status = 'accepted' WHERE id = $1`, [
        fixtures.accept.pendingId,
      ]);
    },
    second: (client) => save(client, fixtures.accept.id, fixtures.accept.updated_at, "champions-league", 1, 4),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT status::text AS status FROM public.applications WHERE id = $1`,
        [fixtures.accept.pendingId],
      );
      const format = await client.query(`SELECT competition_format FROM public.tournaments WHERE id = $1`, [
        fixtures.accept.id,
      ]);
      if (rows[0].status !== "accepted" || format.rows[0].competition_format !== null) {
        throw new Error(`status ${rows[0].status} format ${format.rows[0].competition_format}`);
      }
      return "acceptance committed; save saw two teams and returned CUTOFF_EXCEEDS_TEAMS; format unchanged";
    },
  });
}

function revokeApplication(cluster, fixtures) {
  return overlap(cluster, {
    name: "Application acceptance revocation",
    expectedCode: "TOO_FEW_TEAMS",
    async first(client) {
      await client.query(`UPDATE public.applications SET status = 'new' WHERE id = $1`, [fixtures.revoke.away]);
    },
    second: (client) => save(client, fixtures.revoke.id, fixtures.revoke.updated_at, "champions-league", 1, 4),
    async assert(client) {
      const { rows } = await client.query(`SELECT status::text AS status FROM public.applications WHERE id = $1`, [
        fixtures.revoke.away,
      ]);
      if (rows[0].status !== "new") throw new Error(`status ${rows[0].status}`);
      return "revocation committed; save returned TOO_FEW_TEAMS";
    },
  });
}

function confirmExternal(cluster, fixtures) {
  return overlap(cluster, {
    name: "External-team confirmation",
    expectedCode: "CUTOFF_EXCEEDS_TEAMS",
    async first(client) {
      await client.query(
        `UPDATE public.tournament_external_teams
         SET participation_status = 'confirmed', external_active = true
         WHERE id = $1`,
        [fixtures.confirm.externalId],
      );
    },
    second: (client) => save(client, fixtures.confirm.id, fixtures.confirm.updated_at, "champions-league", 1, 4),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT participation_status FROM public.tournament_external_teams WHERE id = $1`,
        [fixtures.confirm.externalId],
      );
      if (rows[0].participation_status !== "confirmed") throw new Error(rows[0].participation_status);
      return "confirmation committed; save returned CUTOFF_EXCEEDS_TEAMS";
    },
  });
}

function deactivateExternal(cluster, fixtures) {
  return overlap(cluster, {
    name: "External-team deactivation",
    expectedCode: "TOO_FEW_TEAMS",
    async first(client) {
      await client.query(
        `UPDATE public.tournament_external_teams
         SET external_active = false
         WHERE tournament_id = $1 AND id <> $2`,
        [fixtures.deactivate.id, fixtures.deactivate.keepId],
      );
    },
    second: (client) => save(client, fixtures.deactivate.id, fixtures.deactivate.updated_at, "champions-league", 1, 4),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT bool_or(NOT external_active) AS dropped
         FROM public.tournament_external_teams WHERE tournament_id = $1`,
        [fixtures.deactivate.id],
      );
      if (!rows[0].dropped) throw new Error("external team stayed active");
      return "deactivation committed; save returned TOO_FEW_TEAMS";
    },
  });
}

function linkExternal(cluster, fixtures) {
  return overlap(cluster, {
    name: "External-team application linking",
    expectedCode: "TOO_FEW_TEAMS",
    async first(client) {
      await client.query(`UPDATE public.tournament_external_teams SET application_id = $2 WHERE id = $1`, [
        fixtures.link.externalId,
        fixtures.link.applicationId,
      ]);
    },
    second: (client) => save(client, fixtures.link.id, fixtures.link.updated_at, "champions-league", 1, 4),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT application_id FROM public.tournament_external_teams WHERE id = $1`,
        [fixtures.link.externalId],
      );
      if (rows[0].application_id !== fixtures.link.applicationId) throw new Error("link missing");
      return "link committed; save counted one identity and returned TOO_FEW_TEAMS";
    },
  });
}

function createGroup(cluster, fixtures) {
  return overlap(cluster, {
    name: "Group creation",
    expectedCode: "UNSAFE_LEGACY_CONVERSION",
    async first(client) {
      await client.query(`INSERT INTO public.tournament_groups (tournament_id, name) VALUES ($1, 'Concurrent')`, [
        fixtures.groupCreate.id,
      ]);
    },
    second: (client) => save(client, fixtures.groupCreate.id, fixtures.groupCreate.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS groups, (SELECT competition_format FROM public.tournaments WHERE id = $1) AS format
         FROM public.tournament_groups WHERE tournament_id = $1`,
        [fixtures.groupCreate.id],
      );
      if (rows[0].groups !== 1 || rows[0].format !== null) throw new Error(JSON.stringify(rows[0]));
      return "group committed; save returned UNSAFE_LEGACY_CONVERSION";
    },
  });
}

function deleteGroup(cluster, fixtures) {
  return overlap(cluster, {
    name: "Group deletion",
    expectedCode: "GROUPS_NOT_READY",
    async first(client) {
      await client.query(`DELETE FROM public.tournament_groups WHERE id = $1`, [fixtures.groupDelete.groupId]);
    },
    second: (client) => save(client, fixtures.groupDelete.id, fixtures.groupDelete.updated_at, "groups-knockout", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS groups FROM public.tournament_groups WHERE tournament_id = $1`,
        [fixtures.groupDelete.id],
      );
      if (rows[0].groups !== 0) throw new Error(`groups ${rows[0].groups}`);
      return "group deleted; save returned GROUPS_NOT_READY";
    },
  });
}

function changeMembership(cluster, fixtures) {
  return overlap(cluster, {
    name: "Group membership changes",
    expectedCode: "UNSAFE_LEGACY_CONVERSION",
    async first(client) {
      await client.query(
        `INSERT INTO public.tournament_group_members (group_id, application_id) VALUES ($1, $2)`,
        [fixtures.member.groupId, fixtures.member.home],
      );
    },
    second: (client) => save(client, fixtures.member.id, fixtures.member.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS members
         FROM public.tournament_group_members WHERE group_id = $1`,
        [fixtures.member.groupId],
      );
      if (rows[0].members !== 1) throw new Error(`members ${rows[0].members}`);
      return "membership committed; save returned UNSAFE_LEGACY_CONVERSION";
    },
  });
}

function insertMatch(cluster, fixtures) {
  return overlap(cluster, {
    name: "Match insertion",
    expectedCode: "MATCHES_EXIST",
    async first(client) {
      await client.query(
        `INSERT INTO public.tournament_matches (tournament_id, phase, home_application_id, away_application_id)
         VALUES ($1, 'group', $2, $3)`,
        [fixtures.matchInsert.id, fixtures.matchInsert.home, fixtures.matchInsert.away],
      );
    },
    second: (client) => save(client, fixtures.matchInsert.id, fixtures.matchInsert.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS matches,
                (SELECT competition_format FROM public.tournaments WHERE id = $1) AS format
         FROM public.tournament_matches WHERE tournament_id = $1`,
        [fixtures.matchInsert.id],
      );
      if (rows[0].matches !== 1 || rows[0].format !== null) throw new Error(JSON.stringify(rows[0]));
      return "match committed; save returned MATCHES_EXIST";
    },
  });
}

function deleteMatch(cluster, fixtures) {
  return overlap(cluster, {
    name: "Match deletion",
    expectedStatus: "success",
    async first(client) {
      await client.query(`DELETE FROM public.tournament_matches WHERE id = $1`, [fixtures.matchDelete.matchId]);
    },
    second: (client) => save(client, fixtures.matchDelete.id, fixtures.matchDelete.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS matches,
                (SELECT competition_format FROM public.tournaments WHERE id = $1) AS format
         FROM public.tournament_matches WHERE tournament_id = $1`,
        [fixtures.matchDelete.id],
      );
      if (rows[0].matches !== 0 || rows[0].format !== "round-robin") throw new Error(JSON.stringify(rows[0]));
      return "match deleted; save committed round-robin";
    },
  });
}

function updateResult(cluster, fixtures) {
  return overlap(cluster, {
    name: "Result update including 0:0",
    expectedCode: "RESULTS_EXIST",
    async first(client) {
      await client.query(
        `UPDATE public.tournament_matches
         SET home_score = 0, away_score = 0, status = 'completed'
         WHERE id = $1`,
        [fixtures.result.matchId],
      );
    },
    second: (client) => save(client, fixtures.result.id, fixtures.result.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT home_score, away_score,
                (SELECT competition_format FROM public.tournaments WHERE id = $2) AS format
         FROM public.tournament_matches WHERE id = $1`,
        [fixtures.result.matchId, fixtures.result.id],
      );
      if (rows[0].home_score !== 0 || rows[0].away_score !== 0 || rows[0].format !== null) {
        throw new Error(JSON.stringify(rows[0]));
      }
      return "0:0 committed; save returned RESULTS_EXIST; format unchanged";
    },
  });
}

function archiveTournament(cluster, fixtures) {
  return overlap(cluster, {
    name: "Tournament archive",
    expectedCode: "ARCHIVED",
    async first(client) {
      await client.query(`UPDATE public.tournaments SET archived_at = clock_timestamp() WHERE id = $1`, [
        fixtures.archive.id,
      ]);
    },
    second: (client) => save(client, fixtures.archive.id, fixtures.archive.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT archived_at IS NOT NULL AS archived, competition_format FROM public.tournaments WHERE id = $1`,
        [fixtures.archive.id],
      );
      if (!rows[0].archived || rows[0].competition_format !== null) throw new Error(JSON.stringify(rows[0]));
      return "archive committed; save returned ARCHIVED";
    },
  });
}

function renameSlug(cluster, fixtures) {
  return overlap(cluster, {
    name: "Tournament slug update",
    expectedCode: "STALE_CONFIGURATION",
    async first(client) {
      await client.query(`UPDATE public.tournaments SET slug = 'concurrency-slug-renamed' WHERE id = $1`, [
        fixtures.slug.id,
      ]);
    },
    second: (client) => save(client, fixtures.slug.id, fixtures.slug.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT slug, competition_format FROM public.tournaments WHERE id = $1`,
        [fixtures.slug.id],
      );
      if (rows[0].slug !== "concurrency-slug-renamed" || rows[0].competition_format !== null) {
        throw new Error(JSON.stringify(rows[0]));
      }
      return "slug committed; save returned STALE_CONFIGURATION";
    },
  });
}

function replaceSchedule(cluster, fixtures) {
  return overlap(cluster, {
    name: "Schedule replacement",
    expectedStatus: "success",
    async first(client) {
      await client.query(`DELETE FROM public.tournament_matches WHERE tournament_id = $1`, [fixtures.replace.id]);
    },
    second: (client) => save(client, fixtures.replace.id, fixtures.replace.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS matches,
                (SELECT competition_format FROM public.tournaments WHERE id = $1) AS format
         FROM public.tournament_matches WHERE tournament_id = $1`,
        [fixtures.replace.id],
      );
      if (rows[0].matches !== 0 || rows[0].format !== "round-robin") throw new Error(JSON.stringify(rows[0]));
      return "matches deleted; save committed round-robin";
    },
  });
}

function deleteTournament(cluster, fixtures) {
  return overlap(cluster, {
    name: "Tournament deletion",
    async first(client) {
      await client.query(`SELECT id FROM public.tournaments WHERE id = $1 FOR UPDATE`, [fixtures.deletion.id]);
    },
    async second(client) {
      await client.query(`DELETE FROM public.tournaments WHERE id = $1`, [fixtures.deletion.id]);
      return { status: "deleted" };
    },
    async assert(client) {
      const { rows } = await client.query(`SELECT count(*)::integer AS n FROM public.tournaments WHERE id = $1`, [
        fixtures.deletion.id,
      ]);
      const matches = await client.query(
        `SELECT count(*)::integer AS n FROM public.tournament_matches WHERE tournament_id = $1`,
        [fixtures.deletion.id],
      );
      if (rows[0].n !== 0 || matches.rows[0].n !== 0) throw new Error("tournament or matches remained");
      return "delete waited, then removed the tournament and its match";
    },
  });
}

function updateMatchRows(cluster, fixtures) {
  return overlap(cluster, {
    name: "Multi-row match update",
    expectedCode: "MATCHES_EXIST",
    async first(client) {
      const updated = await client.query(
        `UPDATE public.tournament_matches SET sort_order = sort_order + 1 WHERE tournament_id = $1`,
        [fixtures.multi.id],
      );
      if (updated.rowCount !== 3) throw new Error(`updated ${updated.rowCount}`);
    },
    second: (client) => save(client, fixtures.multi.id, fixtures.multi.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT count(*)::integer AS matches, count(*) FILTER (WHERE sort_order = 1)::integer AS bumped,
                (SELECT competition_format FROM public.tournaments WHERE id = $1) AS format
         FROM public.tournament_matches WHERE tournament_id = $1`,
        [fixtures.multi.id],
      );
      if (rows[0].matches !== 3 || rows[0].bumped !== 3 || rows[0].format !== null) {
        throw new Error(JSON.stringify(rows[0]));
      }
      return "three rows bumped; save returned MATCHES_EXIST; format unchanged";
    },
  });
}

function moveMatch(cluster, fixtures) {
  return overlap(cluster, {
    name: "Cross-tournament match move",
    expectedStatus: "success",
    async first(client) {
      await client.query(`UPDATE public.tournament_matches SET tournament_id = $2 WHERE id = $1`, [
        fixtures.movedMatchId,
        fixtures.destination.id,
      ]);
    },
    second: (client) => save(client, fixtures.source.id, fixtures.source.updated_at, "round-robin", null, null),
    async assert(client) {
      const { rows } = await client.query(
        `SELECT
           (SELECT count(*)::integer FROM public.tournament_matches WHERE tournament_id = $1) AS source_matches,
           (SELECT competition_format FROM public.tournaments WHERE id = $1) AS source_format,
           (SELECT count(*)::integer FROM public.tournament_matches WHERE tournament_id = $2) AS dest_matches,
           (SELECT competition_format FROM public.tournaments WHERE id = $2) AS dest_format`,
        [fixtures.source.id, fixtures.destination.id],
      );
      const row = rows[0];
      if (row.source_matches !== 0 || row.source_format !== "round-robin" || row.dest_matches !== 1 || row.dest_format !== null) {
        throw new Error(JSON.stringify(row));
      }
      return "match moved; source save committed; destination format unchanged";
    },
  });
}

async function deadlock(cluster, fixtures) {
  const a = await connect(cluster);
  const b = await connect(cluster);
  const watch = await connect(cluster);
  try {
    const run = async (client, actor, firstId, secondId) => {
      await begin(client, "5s", "12s");
      await client.query(`UPDATE public.tournament_matches SET sort_order = sort_order + 1 WHERE id = $1`, [firstId]);
      await client.query(
        `INSERT INTO public.concurrency_obs (scenario, actor, payload) VALUES ('deadlock', $1, 'first')`,
        [actor],
      );
      await client.query("SELECT pg_sleep(2.0)");
      await client.query(`UPDATE public.tournament_matches SET sort_order = sort_order + 1 WHERE id = $1`, [secondId]);
      await client.query(
        `INSERT INTO public.concurrency_obs (scenario, actor, payload) VALUES ('deadlock', $1, 'second')`,
        [actor],
      );
      await client.query("COMMIT");
    };
    const first = run(a, "A", fixtures.leftMatchId, fixtures.rightMatchId);
    await waitForQuery(watch, "pg_sleep(2.0)");
    const second = run(b, "B", fixtures.rightMatchId, fixtures.leftMatchId);
    const [left, right] = await Promise.all([settle(first), settle(second)]);
    const failures = [left, right].filter((item) => !item.ok);
    const successes = [left, right].filter((item) => item.ok);
    if (failures.length !== 1 || successes.length !== 1 || failures[0].error.code !== "40P01") {
      throw new Error(
        `expected one SQLSTATE 40P01 and one commit, got ${failures.map((item) => item.error.code).join(",")}`,
      );
    }
    const scores = await watch.query(
      `SELECT sort_order FROM public.tournament_matches WHERE id IN ($1, $2) ORDER BY id`,
      [fixtures.leftMatchId, fixtures.rightMatchId],
    );
    if (scores.rows.map((row) => row.sort_order).join(",") !== "1,1") {
      throw new Error(`scores after deadlock ${scores.rows.map((row) => row.sort_order).join(",")}`);
    }
    const obs = await watch.query(
      `SELECT actor, payload FROM public.concurrency_obs WHERE scenario = 'deadlock' ORDER BY id`,
    );
    const actors = new Set(obs.rows.map((row) => row.actor));
    if (actors.size !== 1 || obs.rows.length !== 2) {
      throw new Error(`victim changes remained: ${JSON.stringify(obs.rows)}`);
    }
    await watch.query("BEGIN");
    await watch.query(
      `UPDATE public.tournament_matches SET sort_order = sort_order + 1 WHERE id IN ($1, $2)`,
      [fixtures.leftMatchId, fixtures.rightMatchId],
    );
    const retried = await watch.query(
      `SELECT sort_order FROM public.tournament_matches WHERE id IN ($1, $2) ORDER BY id`,
      [fixtures.leftMatchId, fixtures.rightMatchId],
    );
    await watch.query("COMMIT");
    if (retried.rows.map((row) => row.sort_order).join(",") !== "2,2") {
      throw new Error("retry did not observe the committed state");
    }
    return {
      name: "Opposite-order cross-tournament deadlock",
      status: "PASS",
      detail: "SQLSTATE 40P01 rolled the victim back; survivor left sort_order 1; retry read that state and committed 2",
    };
  } catch (error) {
    if (error && typeof error === "object") {
      error.scenario = "Opposite-order cross-tournament deadlock";
    }
    throw error;
  } finally {
    await Promise.all([a.end().catch(() => {}), b.end().catch(() => {}), watch.end().catch(() => {})]);
  }
}

async function lockTimeoutRetry(cluster, fixtures) {
  const holder = await connect(cluster);
  const waiter = await connect(cluster);
  const watch = await connect(cluster);
  try {
    const held = (async () => {
      await begin(holder, "5s", "12s");
      await holder.query(`SELECT id FROM public.tournaments WHERE id = $1 FOR UPDATE`, [fixtures.retry.id]);
      await holder.query("SELECT pg_sleep(1.2)");
      await holder.query("COMMIT");
    })();
    await waitForQuery(watch, "pg_sleep(1.2)");
    let timeoutError = null;
    try {
      await begin(waiter, "400ms", "5s");
      await save(waiter, fixtures.retry.id, fixtures.retry.updated_at, "round-robin", null, null);
      await waiter.query("COMMIT");
    } catch (error) {
      timeoutError = error;
      await waiter.query("ROLLBACK").catch(() => {});
    }
    const heldResult = await settle(held);
    if (!heldResult.ok) throw new Error(`holder failed: ${heldResult.error.message}`);
    if (!timeoutError || timeoutError.code !== "55P03") {
      throw new Error(`expected lock timeout 55P03, got ${timeoutError ? timeoutError.code : "success"}`);
    }
    const retry = await connect(cluster);
    try {
      await begin(retry, "3s", "8s");
      const result = await save(retry, fixtures.retry.id, fixtures.retry.updated_at, "round-robin", null, null);
      await retry.query("COMMIT");
      if (result.status !== "success") throw new Error(`retry ${JSON.stringify(result)}`);
    } finally {
      await retry.end();
    }
    const { rows } = await watch.query(`SELECT competition_format FROM public.tournaments WHERE id = $1`, [
      fixtures.retry.id,
    ]);
    if (rows[0].competition_format !== "round-robin") throw new Error(`format ${rows[0].competition_format}`);
    return {
      name: "Lock timeout and safe retry",
      status: "PASS",
      detail: `55P03 while the tournament row was locked (${timeoutError.message}); a new transaction saved round-robin`,
    };
  } catch (error) {
    if (error && typeof error === "object") {
      error.scenario = "Lock timeout and safe retry";
    }
    throw error;
  } finally {
    await Promise.all([holder.end().catch(() => {}), waiter.end().catch(() => {}), watch.end().catch(() => {})]);
  }
}

export { resultCode };
