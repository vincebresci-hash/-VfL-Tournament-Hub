/**
 * Reply-specific SQL security/concurrency tests for inbox_replies.
 * Runs only against disposable local Supabase (same harness as run.mjs).
 * Never connects to production. Never sends email.
 */

import {
  assert,
  createPgClient,
  expectError,
  isPermissionDenied,
  withAuthenticatedTransaction,
  withPostgresTransaction,
  withServiceRoleTransaction,
} from "./lib.mjs";

function uuid(n) {
  // Deterministic UUIDv4-shaped ids for CI (version nibble = 4, variant = 8).
  const hex = String(n).padStart(12, "0");
  return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`;
}

async function openAuthenticatedClient(dbUrl, userId) {
  const client = createPgClient(dbUrl);
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
  ]);
  await client.query("SET LOCAL ROLE authenticated");
  const uid = await client.query(`SELECT auth.uid() AS uid`);
  if (uid.rows[0]?.uid !== userId) {
    await client.end();
    throw new Error(`auth.uid() mismatch for concurrent client: ${uid.rows[0]?.uid}`);
  }
  return client;
}

async function claimReply(client, { parentId, key, to, subject, body }) {
  const result = await client.query(
    `SELECT * FROM public.claim_inbox_reply_send(
       $1::uuid, $2::uuid, $3, $4, $5
     )`,
    [parentId, key, to, subject, body],
  );
  return result.rows[0];
}

/**
 * @param {object} ctx
 * @param {object} ctx.env - { dbUrl }
 * @param {object} ctx.users - USERS map from run.mjs
 * @param {string} ctx.mailboxId
 * @param {string} ctx.messageId - parent inbox message (from@example.test)
 * @param {(name: string, fn: Function) => Promise<void>} ctx.test
 */
export async function runInboxReplySqlTests(ctx) {
  const { env, users, mailboxId, messageId, test } = ctx;
  const to = "from@example.test";

  await test("reply-schema: inbox_replies + reply RPCs exist", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      const table = await client.query(
        `SELECT c.relrowsecurity AS rls
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'inbox_replies' AND c.relkind = 'r'`,
      );
      assert(table.rows.length === 1, "inbox_replies missing");
      assert(table.rows[0].rls === true, "inbox_replies RLS disabled");

      for (const name of [
        "claim_inbox_reply_send",
        "finalize_inbox_reply_send",
        "reconcile_inbox_reply_status",
        "expire_stale_inbox_reply_sends",
        "count_inbox_replies_since",
      ]) {
        const { rows } = await client.query(
          `SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = $1`,
          [name],
        );
        assert(rows.length >= 1, `missing RPC ${name}`);
      }

      const domainCol = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'inbox_mailboxes'
           AND column_name = 'reply_message_id_domain'`,
      );
      assert(domainCol.rows.length === 1, "reply_message_id_domain column missing");
    });
  });

  await test("reply-setup: configure mailbox Message-ID domain", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies`);
      await client.query(
        `UPDATE public.inbox_mailboxes
         SET reply_message_id_domain = 'example.test'
         WHERE id = $1`,
        [mailboxId],
      );
    });
  });

  await test("reply-authz: COMMUNICATION_MANAGER cannot claim", async () => {
    const row = await withAuthenticatedTransaction(
      env.dbUrl,
      users.communicationManager.id,
      async (client) =>
        claimReply(client, {
          parentId: messageId,
          key: uuid(1),
          to,
          subject: "Re: Hello CI",
          body: "CM should not send",
        }),
    );
    assert(row.send_allowed === false, "CM must not get send_allowed");
    assert(
      row.error_code === "not_authorized" || row.error_code === "not_authorized_view",
      `expected not_authorized*, got ${row.error_code}`,
    );
  });

  await test("reply-authz: authenticated cannot INSERT/UPDATE/DELETE inbox_replies", async () => {
    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(
            `INSERT INTO public.inbox_replies (
               mailbox_id, parent_message_id, idempotency_key, to_address, subject,
               body_text, message_id_header, status, created_by
             ) VALUES (
               $1, $2, $3::uuid, $4, 'x', 'y', 'mid@example.test', 'sending', $5
             )`,
            [mailboxId, messageId, uuid(2), to, users.admin.id],
          );
        }),
      isPermissionDenied,
      "authenticated INSERT inbox_replies must fail",
    );

    // Seed one row via claim for UPDATE/DELETE attempts.
    const seeded = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(3),
        to,
        subject: "Re: Hello CI",
        body: "seed for mutate deny",
      }),
    );
    assert(seeded.send_allowed === true, "admin claim seed failed");

    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(`UPDATE public.inbox_replies SET status = 'sent' WHERE id = $1`, [
            seeded.reply_id,
          ]);
        }),
      isPermissionDenied,
      "authenticated UPDATE inbox_replies must fail",
    );

    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(`DELETE FROM public.inbox_replies WHERE id = $1`, [seeded.reply_id]);
        }),
      isPermissionDenied,
      "authenticated DELETE inbox_replies must fail",
    );

    // Leave unresolved row — clear via service_role for later tests.
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE id = $1`, [seeded.reply_id]);
    });
  });

  await test("reply-authz: finalize/reconcile/expire inaccessible to authenticated", async () => {
    const claimed = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(4),
        to,
        subject: "Re: Hello CI",
        body: "finalize deny body",
      }),
    );
    assert(claimed.send_allowed === true, "claim for finalize deny failed");

    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(
            `SELECT public.finalize_inbox_reply_send($1::uuid, 'sent', NULL, NULL)`,
            [claimed.reply_id],
          );
        }),
      isPermissionDenied,
      "authenticated finalize must fail",
    );

    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(
            `SELECT public.reconcile_inbox_reply_status($1::uuid, 'failed', 'nope')`,
            [claimed.reply_id],
          );
        }),
      isPermissionDenied,
      "authenticated reconcile must fail",
    );

    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
          await client.query(`SELECT public.expire_stale_inbox_reply_sends(NULL, 900)`);
        }),
      isPermissionDenied,
      "authenticated expire must fail",
    );

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });
  });

  await test("reply-authz: service_role finalize + reconcile work", async () => {
    const claimed = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(5),
        to,
        subject: "Re: Hello CI",
        body: "service finalize body",
      }),
    );
    assert(claimed.send_allowed === true, "claim failed");
    assert(claimed.message_id_header?.endsWith("@example.test"), "server Message-ID domain");

    const finalized = await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const result = await client.query(
        `SELECT public.finalize_inbox_reply_send($1::uuid, 'uncertain', 'timeout', NULL) AS ok`,
        [claimed.reply_id],
      );
      return result.rows[0].ok;
    });
    assert(finalized === true, "service_role finalize uncertain failed");

    const reconciled = await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const result = await client.query(
        `SELECT public.reconcile_inbox_reply_status($1::uuid, 'failed', 'ops confirmed') AS ok`,
        [claimed.reply_id],
      );
      return result.rows[0].ok;
    });
    assert(reconciled === true, "service_role reconcile failed");

    const row = await withPostgresTransaction(env.dbUrl, async (client) => {
      const result = await client.query(
        `SELECT status FROM public.inbox_replies WHERE id = $1`,
        [claimed.reply_id],
      );
      return result.rows[0];
    });
    assert(row.status === "failed", `expected failed, got ${row.status}`);
  });

  await test("reply-authz: parent/mailbox gates (not found, recipient, domain)", async () => {
    const missingParent = await withAuthenticatedTransaction(
      env.dbUrl,
      users.admin.id,
      async (client) =>
        claimReply(client, {
          parentId: "99999999-9999-4999-8999-999999999999",
          key: uuid(6),
          to,
          subject: "Re: x",
          body: "missing parent",
        }),
    );
    assert(missingParent.error_code === "parent_not_found", "parent_not_found expected");

    const locked = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(7),
        to: "other@example.test",
        subject: "Re: x",
        body: "wrong recipient",
      }),
    );
    assert(locked.error_code === "recipient_locked", "recipient_locked expected");

    await withPostgresTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_mailboxes SET reply_message_id_domain = NULL WHERE id = $1`,
        [mailboxId],
      );
    });
    const noDomain = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(8),
        to,
        subject: "Re: x",
        body: "no domain",
      }),
    );
    assert(noDomain.error_code === "domain_not_configured", "domain_not_configured expected");

    await withPostgresTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_mailboxes
         SET reply_message_id_domain = 'example.test'
         WHERE id = $1`,
        [mailboxId],
      );
    });
  });

  await test("reply-concurrency: same idempotency key → one send_allowed", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });

    const key = uuid(10);
    const clientA = await openAuthenticatedClient(env.dbUrl, users.admin.id);
    const clientB = await openAuthenticatedClient(env.dbUrl, users.admin.id);
    try {
      const [a, b] = await Promise.all([
        claimReply(clientA, {
          parentId: messageId,
          key,
          to,
          subject: "Re: Hello CI",
          body: "same-key concurrent A",
        }),
        claimReply(clientB, {
          parentId: messageId,
          key,
          to,
          subject: "Re: Hello CI",
          body: "same-key concurrent B",
        }),
      ]);
      await clientA.query("COMMIT");
      await clientB.query("COMMIT");

      const allowed = [a, b].filter((row) => row.send_allowed === true);
      assert(allowed.length === 1, `expected 1 send_allowed, got ${allowed.length}`);
      const denied = [a, b].filter((row) => row.send_allowed === false);
      assert(denied.length === 1, "expected one replay/denied claim");
      assert(
        a.reply_id === b.reply_id,
        "same actor+key must resolve to one reply_id",
      );
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  await test("reply-concurrency: different keys same actor → unresolved blocks second", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });

    const first = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(11),
        to,
        subject: "Re: Hello CI",
        body: "first in-flight",
      }),
    );
    assert(first.send_allowed === true, "first claim should send");

    const second = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(12),
        to,
        subject: "Re: Hello CI",
        body: "second should block",
      }),
    );
    assert(second.send_allowed === false, "second key must not send while unresolved");
    assert(
      second.error_code === "unresolved_reply_exists",
      `expected unresolved_reply_exists, got ${second.error_code}`,
    );

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });
  });

  await test("reply-concurrency: cross-actor same key is isolated", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies`);
    });

    const sharedKey = uuid(13);
    const adminClaim = await withAuthenticatedTransaction(
      env.dbUrl,
      users.admin.id,
      async (client) =>
        claimReply(client, {
          parentId: messageId,
          key: sharedKey,
          to,
          subject: "Re: Hello CI",
          body: "admin body",
        }),
    );
    assert(adminClaim.send_allowed === true, "admin claim failed");

    // Finalize admin so superAdmin is not blocked by unresolved on same parent... 
    // Actually unresolved is per (created_by, parent). SuperAdmin has no unresolved.
    const superClaim = await withAuthenticatedTransaction(
      env.dbUrl,
      users.superAdmin.id,
      async (client) =>
        claimReply(client, {
          parentId: messageId,
          key: sharedKey,
          to,
          subject: "Re: Hello CI",
          body: "super body",
        }),
    );
    assert(superClaim.send_allowed === true, "superAdmin should claim independently");
    assert(
      adminClaim.reply_id !== superClaim.reply_id,
      "cross-actor rows must be distinct",
    );

    // Admin replaying own key must not receive superAdmin's reply_id.
    const adminReplay = await withAuthenticatedTransaction(
      env.dbUrl,
      users.admin.id,
      async (client) =>
        claimReply(client, {
          parentId: messageId,
          key: sharedKey,
          to,
          subject: "Re: Hello CI",
          body: "admin body",
        }),
    );
    assert(adminReplay.already_existed === true, "admin replay expected");
    assert(adminReplay.reply_id === adminClaim.reply_id, "admin replay leaked other actor row");
    assert(adminReplay.send_allowed === false, "replay must not send");

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies`);
    });
  });

  await test("reply-concurrency: atomic rate limit under parallel claims", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });

    // Distinct parents so unresolved-per-parent does not mask the rate limiter.
    const parentIds = await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const lockToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      await client.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 180)`, [
        mailboxId,
        lockToken,
      ]);
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        const upserted = await client.query(
          `SELECT public.upsert_inbox_message_from_sync(
             $1::uuid, $2::uuid, 'INBOX', 100, $3::bigint,
             $4, NULL, NULL, $5,
             'from@example.test', 'From',
             '[]'::jsonb, '[]'::jsonb,
             $6, now(), now(), 'snippet',
             'body', NULL, false, 10, '[]'::jsonb
           ) AS id`,
          [
            mailboxId,
            lockToken,
            50 + i,
            `<rate-${i}@example.test>`,
            `thread-rate-${i}`,
            `Rate parent ${i}`,
          ],
        );
        ids.push(upserted.rows[0].id);
      }
      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        lockToken,
      ]);
      return ids;
    });

    // Pre-fill 18 resolved rows so only 2 slots remain in the 20/10min window.
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      for (let i = 0; i < 18; i += 1) {
        await client.query(
          `INSERT INTO public.inbox_replies (
             mailbox_id, parent_message_id, idempotency_key, to_address, subject,
             body_text, message_id_header, status, created_by, created_at
           ) VALUES (
             $1, $2, $3::uuid, $4, 'Re: preload', 'preload',
             $5, 'failed', $6, now() - interval '1 minute'
           )`,
          [
            mailboxId,
            messageId,
            uuid(100 + i),
            to,
            `${uuid(100 + i)}@example.test`,
            users.admin.id,
          ],
        );
      }
    });

    const keys = [uuid(20), uuid(21), uuid(22), uuid(23), uuid(24)];
    const clients = await Promise.all(
      keys.map(() => openAuthenticatedClient(env.dbUrl, users.admin.id)),
    );
    try {
      const results = await Promise.all(
        clients.map((client, index) =>
          claimReply(client, {
            parentId: parentIds[index],
            key: keys[index],
            to,
            subject: "Re: Hello CI",
            body: `rate-limit burst ${index}`,
          }),
        ),
      );
      await Promise.all(clients.map((client) => client.query("COMMIT")));

      const allowed = results.filter((row) => row.send_allowed === true);
      const limited = results.filter((row) => row.error_code === "rate_limited");

      assert(allowed.length <= 2, `rate limit exceeded: ${allowed.length} allowed`);
      assert(limited.length >= 3, `expected >=3 rate_limited, got ${limited.length}`);
      assert(
        allowed.length + limited.length === results.length,
        `unexpected codes: ${results.map((row) => row.error_code || "ok").join(",")}`,
      );

      const total = await withPostgresTransaction(env.dbUrl, async (client) => {
        const result = await client.query(
          `SELECT COUNT(*)::int AS n
           FROM public.inbox_replies
           WHERE created_by = $1
             AND created_at >= now() - interval '10 minutes'`,
          [users.admin.id],
        );
        return result.rows[0].n;
      });
      assert(total <= 20, `window count ${total} exceeds 20`);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });
  });

  await test("reply-lifecycle: stale sending → uncertain; new key blocked", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
      await client.query(
        `INSERT INTO public.inbox_replies (
           mailbox_id, parent_message_id, idempotency_key, to_address, subject,
           body_text, message_id_header, status, created_by, created_at, updated_at
         ) VALUES (
           $1, $2, $3::uuid, $4, 'Re: stale', 'stale body',
           'stale@example.test', 'sending', $5,
           now() - interval '20 minutes', now() - interval '20 minutes'
         )`,
        [mailboxId, messageId, uuid(30), to, users.admin.id],
      );
    });

    const blocked = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key: uuid(31),
        to,
        subject: "Re: Hello CI",
        body: "should block after stale→uncertain",
      }),
    );
    assert(blocked.send_allowed === false, "new key must not send");
    assert(
      blocked.error_code === "unresolved_reply_exists",
      `expected unresolved_reply_exists, got ${blocked.error_code}`,
    );

    const stale = await withPostgresTransaction(env.dbUrl, async (client) => {
      const result = await client.query(
        `SELECT status, error FROM public.inbox_replies
         WHERE created_by = $1 AND idempotency_key = $2::uuid`,
        [users.admin.id, uuid(30)],
      );
      return result.rows[0];
    });
    assert(stale.status === "uncertain", `stale sending should be uncertain, got ${stale.status}`);
    assert(
      `${stale.error || ""}`.includes("send_abandoned_timeout"),
      "stale error should mention abandon timeout",
    );

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });
  });

  await test("reply-lifecycle: same key replay never re-authorizes SMTP", async () => {
    const key = uuid(32);
    const first = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key,
        to,
        subject: "Re: Hello CI",
        body: "replay body",
      }),
    );
    assert(first.send_allowed === true, "first claim");

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `SELECT public.finalize_inbox_reply_send($1::uuid, 'sent', NULL, '250 ok')`,
        [first.reply_id],
      );
    });

    const replay = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) =>
      claimReply(client, {
        parentId: messageId,
        key,
        to,
        subject: "Re: Hello CI",
        body: "replay body",
      }),
    );
    assert(replay.already_existed === true, "replay should already_existed");
    assert(replay.send_allowed === false, "replay must not send again");
    assert(replay.status === "sent", "replay status should remain sent");

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`DELETE FROM public.inbox_replies WHERE created_by = $1`, [
        users.admin.id,
      ]);
    });
  });

  await test("reply-migration: transactional rollback leaves reply schema intact", async () => {
    const before = await withPostgresTransaction(env.dbUrl, async (client) => {
      const result = await client.query(`SELECT COUNT(*)::int AS n FROM public.inbox_replies`);
      return result.rows[0].n;
    });

    const client = createPgClient(env.dbUrl);
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SAVEPOINT sp_reply_fail");
      let failed = false;
      try {
        await client.query(
          `INSERT INTO public.inbox_replies (
             mailbox_id, parent_message_id, idempotency_key, to_address, subject,
             body_text, message_id_header, status, attachment_count, created_by
           ) VALUES (
             $1, $2, $3::uuid, $4, 'x', 'y', 'mid@example.test', 'sending', 1, $5
           )`,
          [mailboxId, messageId, uuid(40), to, users.admin.id],
        );
      } catch (error) {
        failed = true;
        assert(
          `${error.message || ""}`.toLowerCase().includes("attachment_count") ||
            error.code === "23514",
          "expected attachment_count check failure",
        );
        await client.query("ROLLBACK TO SAVEPOINT sp_reply_fail");
      }
      assert(failed, "invalid attachment_count insert should fail");
      await client.query("COMMIT");
    } finally {
      await client.end();
    }

    const after = await withPostgresTransaction(env.dbUrl, async (client) => {
      const tables = await client.query(
        `SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'inbox_replies'`,
      );
      assert(tables.rows.length === 1, "inbox_replies disappeared after rollback");
      const result = await client.query(`SELECT COUNT(*)::int AS n FROM public.inbox_replies`);
      return result.rows[0].n;
    });
    assert(after === before, "rollback must not leave partial reply rows");
  });

  await test("reply-regression: legacy inbox SELECT/local-state still work", async () => {
    const rows = await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const selected = await client.query(
        `SELECT id FROM public.inbox_messages WHERE id = $1`,
        [messageId],
      );
      const updated = await client.query(
        `SELECT public.set_inbox_message_local_state($1::uuid, true, 'open') AS ok`,
        [messageId],
      );
      return { selected: selected.rows, ok: updated.rows[0].ok };
    });
    assert(rows.selected.length === 1, "ADMIN still sees inbox message");
    assert(rows.ok === true, "legacy local-state RPC still works");

    const cm = await withAuthenticatedTransaction(
      env.dbUrl,
      users.communicationManager.id,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM public.inbox_messages WHERE id = $1`,
          [messageId],
        );
        return result.rows;
      },
    );
    assert(cm.length === 0, "CM still denied inbox SELECT");
  });
}
