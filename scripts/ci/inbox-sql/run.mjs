#!/usr/bin/env node
/**
 * Executable inbox SQL integration harness (local disposable Supabase only).
 *
 * Usage (after `supabase start` && `supabase db reset --yes`):
 *   node scripts/ci/inbox-sql/run.mjs
 *
 * Never connect to production. Never use IONOS/Resend secrets.
 */

import {
  assert,
  createPgClient,
  createServiceSupabase,
  expectError,
  isLockLost,
  isPermissionDenied,
  loadLocalSupabaseEnv,
  withAuthenticatedTransaction,
  withPostgresTransaction,
  withServiceRoleTransaction,
} from "./lib.mjs";

const USERS = {
  superAdmin: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "inbox-super@example.test",
    roleKey: "SUPER_ADMIN",
    profileRole: "super-admin",
  },
  admin: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "inbox-admin@example.test",
    roleKey: "ADMIN",
    profileRole: "admin",
  },
  communicationManager: {
    id: "33333333-3333-4333-8333-333333333333",
    email: "inbox-cm@example.test",
    roleKey: "COMMUNICATION_MANAGER",
    profileRole: "club",
  },
};

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`• ${name} ... `);
  try {
    await fn();
    passed += 1;
    process.stdout.write("ok\n");
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    process.stdout.write("FAIL\n");
    console.error(`  ${error instanceof Error ? error.message : error}`);
  }
}

async function ensureAuthUser(supabase, user) {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) {
    throw listError;
  }
  const existing = listed?.users?.find(
    (row) => row.email?.toLowerCase() === user.email.toLowerCase(),
  );
  if (existing?.id) {
    user.id = existing.id;
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: "Inbox-Test-Password-1!",
    email_confirm: true,
    user_metadata: { first_name: "Inbox", last_name: user.roleKey },
  });
  if (error) {
    // Retry without explicit id if the Auth schema rejects client-supplied ids.
    const retry = await supabase.auth.admin.createUser({
      email: user.email,
      password: "Inbox-Test-Password-1!",
      email_confirm: true,
      user_metadata: { first_name: "Inbox", last_name: user.roleKey },
    });
    if (retry.error || !retry.data.user?.id) {
      throw error;
    }
    user.id = retry.data.user.id;
    return user.id;
  }
  assert(data.user?.id, `createUser missing id for ${user.email}`);
  user.id = data.user.id;
  return data.user.id;
}

async function seedUsersAndRoles(dbUrl, supabase) {
  for (const user of Object.values(USERS)) {
    await ensureAuthUser(supabase, user);
  }

  await withPostgresTransaction(dbUrl, async (client) => {
    for (const user of Object.values(USERS)) {
      await client.query(
        `UPDATE public.profiles
         SET role = $2::public.user_role,
             is_active = true,
             email = $3,
             updated_at = now()
         WHERE id = $1`,
        [user.id, user.profileRole, user.email],
      );

      await client.query(`DELETE FROM public.rbac_user_roles WHERE user_id = $1`, [user.id]);
      await client.query(
        `INSERT INTO public.rbac_user_roles (user_id, role_id, club_id)
         SELECT $1::uuid, r.id, NULL
         FROM public.rbac_roles AS r
         WHERE r.key = $2
         ON CONFLICT DO NOTHING`,
        [user.id, user.roleKey],
      );
    }
  });
}

async function seedMailbox(dbUrl) {
  return withPostgresTransaction(dbUrl, async (client) => {
    await client.query(`DELETE FROM public.inbox_storage_leases`);
    await client.query(`DELETE FROM public.inbox_attachments`);
    await client.query(`DELETE FROM public.inbox_messages`);
    await client.query(`DELETE FROM public.inbox_sync_state`);
    await client.query(`DELETE FROM public.inbox_mailboxes`);

    const mailbox = await client.query(
      `INSERT INTO public.inbox_mailboxes (label, folder, is_active)
       VALUES ('CI Inbox', 'INBOX', true)
       RETURNING id`,
    );
    const mailboxId = mailbox.rows[0].id;
    await client.query(
      `INSERT INTO public.inbox_sync_state (
         mailbox_id, folder, uidvalidity, cursor_uid, backfill_complete
       ) VALUES ($1, 'INBOX', 100, 0, false)`,
      [mailboxId],
    );
    return mailboxId;
  });
}

async function main() {
  console.log("Inbox SQL integration harness (local disposable Supabase only)");
  const env = loadLocalSupabaseEnv();
  const supabase = createServiceSupabase(env);

  await seedUsersAndRoles(env.dbUrl, supabase);
  const mailboxId = await seedMailbox(env.dbUrl);

  // ---------------------------------------------------------------------------
  // A. Migration / schema
  // ---------------------------------------------------------------------------
  await test("schema: inbox tables exist", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      for (const table of [
        "inbox_mailboxes",
        "inbox_sync_state",
        "inbox_messages",
        "inbox_attachments",
        "inbox_storage_leases",
      ]) {
        const { rows } = await client.query(
          `SELECT c.relrowsecurity AS rls
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
          [table],
        );
        assert(rows.length === 1, `missing table ${table}`);
        assert(rows[0].rls === true, `RLS not enabled on ${table}`);
      }
    });
  });

  await test("schema: required RPCs exist", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      const required = [
        "acquire_inbox_sync_lock",
        "release_inbox_sync_lock",
        "claim_inbox_sync_lock_for_mutation",
        "advance_inbox_sync_cursor",
        "upsert_inbox_message_from_sync",
        "upsert_inbox_attachment_from_sync",
        "set_inbox_message_local_state",
        "get_inbox_unread_count",
        "get_inbox_sync_status",
        "register_inbox_storage_lease",
        "commit_inbox_storage_lease",
        "list_expired_inbox_storage_leases",
        "delete_inbox_storage_lease",
        "mark_inbox_attachment_repair_attempt",
      ];
      for (const name of required) {
        const { rows } = await client.query(
          `SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = $1`,
          [name],
        );
        assert(rows.length >= 1, `missing RPC ${name}`);
      }
    });
  });

  await test("schema: private inbox-attachments bucket", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      const { rows } = await client.query(
        `SELECT id, public FROM storage.buckets WHERE id = 'inbox-attachments'`,
      );
      assert(rows.length === 1, "inbox-attachments bucket missing");
      assert(rows[0].public === false, "inbox-attachments bucket must be private");
    });
  });

  // ---------------------------------------------------------------------------
  // B. Authorization
  // ---------------------------------------------------------------------------
  let messageId;

  await test("authz: seed message via service_role sync RPC", async () => {
    const lockToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const locked = await client.query(
        `SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 180) AS ok`,
        [mailboxId, lockToken],
      );
      assert(locked.rows[0].ok === true, "acquire lock failed");

      const upserted = await client.query(
        `SELECT public.upsert_inbox_message_from_sync(
           $1::uuid, $2::uuid, 'INBOX', 100, 1,
           '<m1@example.test>', NULL, NULL, 'thread-1',
           'from@example.test', 'From',
           '[]'::jsonb, '[]'::jsonb,
           'Hello CI', now(), now(), 'snippet',
           'body text', '<p>body</p>', false, 12, '[]'::jsonb
         ) AS id`,
        [mailboxId, lockToken],
      );
      messageId = upserted.rows[0].id;
      assert(messageId, "message id missing");

      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        lockToken,
      ]);
    });
  });

  await test("authz: SUPER_ADMIN can SELECT inbox_messages", async () => {
    const rows = await withAuthenticatedTransaction(
      env.dbUrl,
      USERS.superAdmin.id,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM public.inbox_messages WHERE id = $1`,
          [messageId],
        );
        return result.rows;
      },
    );
    assert(rows.length === 1, "SUPER_ADMIN should see message");
  });

  await test("authz: ADMIN can SELECT inbox_messages", async () => {
    const rows = await withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
      const result = await client.query(
        `SELECT id FROM public.inbox_messages WHERE id = $1`,
        [messageId],
      );
      return result.rows;
    });
    assert(rows.length === 1, "ADMIN should see message");
  });

  await test("authz: COMMUNICATION_MANAGER cannot SELECT inbox_messages", async () => {
    const rows = await withAuthenticatedTransaction(
      env.dbUrl,
      USERS.communicationManager.id,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM public.inbox_messages WHERE id = $1`,
          [messageId],
        );
        return result.rows;
      },
    );
    assert(rows.length === 0, "CM must not see inbox messages under RLS");
  });

  await test("authz: CM denied set_inbox_message_local_state", async () => {
    await expectError(
      () =>
        withAuthenticatedTransaction(
          env.dbUrl,
          USERS.communicationManager.id,
          async (client) => {
            await client.query(
              `SELECT public.set_inbox_message_local_state($1::uuid, false, 'done')`,
              [messageId],
            );
          },
        ),
      isPermissionDenied,
      "CM set_inbox_message_local_state should fail",
    );
  });

  await test("authz: ADMIN can set local state with inbox.manage", async () => {
    const ok = await withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
      const result = await client.query(
        `SELECT public.set_inbox_message_local_state($1::uuid, false, 'in_progress') AS ok`,
        [messageId],
      );
      return result.rows[0].ok;
    });
    assert(ok === true, "ADMIN local state update failed");
  });

  await test("authz: authenticated cannot execute sync lock RPC", async () => {
    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
          await client.query(
            `SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 60)`,
            [mailboxId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
          );
        }),
      isPermissionDenied,
      "authenticated must not execute acquire_inbox_sync_lock",
    );
  });

  await test("authz: sync status hides lock token", async () => {
    await expectError(
      () =>
        withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
          await client.query(`SELECT lock_token FROM public.inbox_sync_state LIMIT 1`);
        }),
      (error) => isPermissionDenied(error) || `${error.message || ""}`.includes("permission"),
      "authenticated must not SELECT inbox_sync_state",
    );

    const status = await withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
      const result = await client.query(`SELECT * FROM public.get_inbox_sync_status()`);
      return result.rows[0];
    });
    assert(status, "get_inbox_sync_status returned no row");
    assert(!("lock_token" in status), "status must not expose lock_token");
    assert(!("lock_acquired_at" in status), "status must not expose lock_acquired_at");
    assert(!("lock_expires_at" in status), "status must not expose lock_expires_at");
  });

  // ---------------------------------------------------------------------------
  // C. Concurrency
  // ---------------------------------------------------------------------------
  await test("concurrency: exactly one lock winner across two connections", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
    });

    const tokenA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const tokenB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const clientA = createPgClient(env.dbUrl);
    const clientB = createPgClient(env.dbUrl);
    await clientA.connect();
    await clientB.connect();
    try {
      await clientA.query("SET ROLE service_role");
      await clientB.query("SET ROLE service_role");
      for (const client of [clientA, clientB]) {
        const role = await client.query(
          `SELECT current_user AS current_user, current_setting('role', true) AS session_role`,
        );
        assert(
          role.rows[0].current_user === "service_role" ||
            role.rows[0].session_role === "service_role",
          "concurrency clients must run as service_role",
        );
        assert(
          role.rows[0].current_user !== "postgres" && role.rows[0].session_role !== "postgres",
          "concurrency clients must not remain postgres",
        );
      }
      const [resultA, resultB] = await Promise.all([
        clientA.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120) AS ok`, [
          mailboxId,
          tokenA,
        ]),
        clientB.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120) AS ok`, [
          mailboxId,
          tokenB,
        ]),
      ]);
      const wins = [resultA.rows[0].ok, resultB.rows[0].ok].filter(Boolean).length;
      assert(wins === 1, `expected exactly one lock winner, got ${wins}`);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  await test("concurrency: stale worker rejected after expiry + reacquire", async () => {
    const staleToken = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const freshToken = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      const acquired = await client.query(
        `SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 30) AS ok`,
        [mailboxId, staleToken],
      );
      assert(acquired.rows[0].ok === true, "stale token acquire failed");
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_expires_at = now() - interval '5 seconds'
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const acquired = await client.query(
        `SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120) AS ok`,
        [mailboxId, freshToken],
      );
      assert(acquired.rows[0].ok === true, "fresh token should acquire after expiry");
    });

    await expectError(
      () =>
        withServiceRoleTransaction(env.dbUrl, async (client) => {
          await client.query(
            `SELECT public.upsert_inbox_message_from_sync(
               $1::uuid, $2::uuid, 'INBOX', 100, 2,
               NULL, NULL, NULL, 'thread-stale',
               'x@example.test', '', '[]'::jsonb, '[]'::jsonb,
               'stale', now(), now(), '', NULL, NULL, false, 1, '[]'::jsonb
             )`,
            [mailboxId, staleToken],
          );
        }),
      isLockLost,
      "stale upsert must raise Sync lock lost",
    );

    const advanced = await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const result = await client.query(
        `SELECT public.advance_inbox_sync_cursor(
           $1::uuid, $2::uuid, 100, 1, false, NULL, true
         ) AS ok`,
        [mailboxId, staleToken],
      );
      return result.rows[0].ok;
    });
    assert(advanced === false, "stale cursor advance must return false");

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        freshToken,
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // D. Data integrity
  // ---------------------------------------------------------------------------
  await test("integrity: UIDVALIDITY reset clears cursor generation", async () => {
    const token = "12121212-1212-4121-8121-121212121212";
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL,
             uidvalidity = 100, cursor_uid = 50, backfill_complete = true
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      const acquired = await client.query(
        `SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120) AS ok`,
        [mailboxId, token],
      );
      assert(acquired.rows[0].ok === true, "lock for uidvalidity test");

      const advanced = await client.query(
        `SELECT public.advance_inbox_sync_cursor(
           $1::uuid, $2::uuid, 200, 3, false, NULL, true
         ) AS ok`,
        [mailboxId, token],
      );
      assert(advanced.rows[0].ok === true, "uidvalidity advance failed");

      const state = await client.query(
        `SELECT uidvalidity, cursor_uid, backfill_complete
         FROM public.inbox_sync_state WHERE mailbox_id = $1`,
        [mailboxId],
      );
      assert(Number(state.rows[0].uidvalidity) === 200, "uidvalidity not updated");
      assert(Number(state.rows[0].cursor_uid) === 3, "cursor should reset to new generation value");
      assert(state.rows[0].backfill_complete === false, "backfill should reset on uidvalidity change");

      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        token,
      ]);
    });
  });

  await test("integrity: invalid cursor rejected", async () => {
    const token = "34343434-3434-4343-8343-343434343434";
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      await client.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 60)`, [
        mailboxId,
        token,
      ]);
    });

    await expectError(
      () =>
        withServiceRoleTransaction(env.dbUrl, async (client) => {
          await client.query(
            `SELECT public.advance_inbox_sync_cursor(
               $1::uuid, $2::uuid, 200, -1, false, NULL, true
             )`,
            [mailboxId, token],
          );
        }),
      (error) => `${error.message || ""}`.toLowerCase().includes("invalid cursor"),
      "negative cursor must raise",
    );

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        token,
      ]);
    });
  });

  await test("integrity: local unread/status preserved across sync upsert", async () => {
    const token = "56565656-5656-4565-8565-565656565656";
    await withAuthenticatedTransaction(env.dbUrl, USERS.admin.id, async (client) => {
      await client.query(
        `SELECT public.set_inbox_message_local_state($1::uuid, false, 'done')`,
        [messageId],
      );
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      await client.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120)`, [
        mailboxId,
        token,
      ]);
      await client.query(
        `SELECT public.upsert_inbox_message_from_sync(
           $1::uuid, $2::uuid, 'INBOX', 100, 1,
           '<m1@example.test>', NULL, NULL, 'thread-1',
           'from@example.test', 'From',
           '[]'::jsonb, '[]'::jsonb,
           'Hello CI updated', now(), now(), 'snippet2',
           'body text 2', '<p>body2</p>', false, 15, '[]'::jsonb
         )`,
        [mailboxId, token],
      );
      const row = await client.query(
        `SELECT is_unread_local, processing_status, subject
         FROM public.inbox_messages WHERE id = $1`,
        [messageId],
      );
      assert(row.rows[0].is_unread_local === false, "unread local overwritten");
      assert(row.rows[0].processing_status === "done", "processing_status overwritten");
      assert(row.rows[0].subject === "Hello CI updated", "subject should update from sync");
      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        token,
      ]);
    });
  });

  await test("integrity: stored attachment never downgraded + repair bookkeeping", async () => {
    const token = "78787878-7878-4787-8787-787878787878";
    let attachmentId;

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      await client.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 120)`, [
        mailboxId,
        token,
      ]);

      const stored = await client.query(
        `SELECT * FROM public.upsert_inbox_attachment_from_sync(
           $1::uuid, $2::uuid, $3::uuid, 0,
           'plan.pdf', 'application/pdf', 100, NULL,
           $4, 'abc123', true, NULL
         )`,
        [mailboxId, token, messageId, `${mailboxId}/${messageId}/a1/plan.pdf`],
      );
      attachmentId = stored.rows[0].attachment_id;
      assert(attachmentId, "attachment id missing");

      const downgrade = await client.query(
        `SELECT * FROM public.upsert_inbox_attachment_from_sync(
           $1::uuid, $2::uuid, $3::uuid, 0,
           'plan.pdf', 'application/pdf', 100, NULL,
           NULL, NULL, false, 'storage_upload_failed'
         )`,
        [mailboxId, token, messageId],
      );
      assert(downgrade.rows[0].kept_existing === true, "must keep existing stored attachment");

      const row = await client.query(
        `SELECT stored, storage_path, skip_reason, retry_count
         FROM public.inbox_attachments WHERE id = $1`,
        [attachmentId],
      );
      assert(row.rows[0].stored === true, "stored flag downgraded");
      assert(row.rows[0].storage_path, "storage_path cleared on failed retry");
      assert(row.rows[0].skip_reason === null, "skip_reason should stay cleared while stored");

      // Repair bookkeeping on a separate failed part.
      await client.query(
        `SELECT * FROM public.upsert_inbox_attachment_from_sync(
           $1::uuid, $2::uuid, $3::uuid, 1,
           'notes.txt', 'text/plain', 10, NULL,
           NULL, NULL, false, 'storage_upload_failed'
         )`,
        [mailboxId, token, messageId],
      );
      const broken = await client.query(
        `SELECT id, retry_count FROM public.inbox_attachments
         WHERE message_id = $1 AND part_index = 1`,
        [messageId],
      );
      const brokenId = broken.rows[0].id;
      await client.query(
        `SELECT public.mark_inbox_attachment_repair_attempt(
           $1::uuid, $2::uuid, $3::uuid, 'repair_attempt'
         )`,
        [mailboxId, token, brokenId],
      );
      const after = await client.query(
        `SELECT retry_count, last_repair_error
         FROM public.inbox_attachments WHERE id = $1`,
        [brokenId],
      );
      assert(Number(after.rows[0].retry_count) === Number(broken.rows[0].retry_count) + 1, "retry_count");
      assert(after.rows[0].last_repair_error === "repair_attempt", "error code not stored");
      assert(
        !`${after.rows[0].last_repair_error}`.includes("@"),
        "repair error must not contain message content",
      );

      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        token,
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // E. Storage leases / orphan GC
  // ---------------------------------------------------------------------------
  await test("storage: orphan lease GC rules + idempotent delete", async () => {
    const activeToken = "90909090-9090-4909-8909-909090909090";
    const orphanPath = `${mailboxId}/orphan/path/file.pdf`;
    const referencedPath = `${mailboxId}/${messageId}/a1/plan.pdf`;
    const activePath = `${mailboxId}/active/lock/file.pdf`;

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_sync_state
         SET lock_token = NULL, lock_acquired_at = NULL, lock_expires_at = NULL
         WHERE mailbox_id = $1`,
        [mailboxId],
      );
      await client.query(`SELECT public.acquire_inbox_sync_lock($1::uuid, $2::uuid, 180)`, [
        mailboxId,
        activeToken,
      ]);

      await client.query(
        `SELECT public.register_inbox_storage_lease(
           $1::uuid, $2::uuid, $3, $4::uuid, NULL
         )`,
        [mailboxId, activeToken, activePath, messageId],
      );

      // Orphan lease with expired age + no lock ownership match after we release later.
      await client.query(
        `INSERT INTO public.inbox_storage_leases (
           storage_path, mailbox_id, message_id, lock_token, committed, created_at
         ) VALUES ($1, $2, $3, $4::uuid, false, now() - interval '1 hour')
         ON CONFLICT (storage_path) DO UPDATE
         SET committed = false, created_at = EXCLUDED.created_at, lock_token = EXCLUDED.lock_token`,
        [orphanPath, mailboxId, messageId, "abababab-abab-4bab-8bab-abababababab"],
      );

      // Referenced stored path lease (should not be deletable while attachment.stored).
      await client.query(
        `INSERT INTO public.inbox_storage_leases (
           storage_path, mailbox_id, message_id, lock_token, committed, created_at
         ) VALUES ($1, $2, $3, NULL, false, now() - interval '1 hour')
         ON CONFLICT (storage_path) DO UPDATE
         SET committed = false, created_at = EXCLUDED.created_at`,
        [referencedPath, mailboxId, messageId],
      );

      const listedWhileLocked = await client.query(
        `SELECT storage_path FROM public.list_expired_inbox_storage_leases(900, 50)`,
      );
      const listedPaths = listedWhileLocked.rows.map((row) => row.storage_path);
      assert(!listedPaths.includes(activePath), "active lock-holder lease must not be listed");
      assert(!listedPaths.includes(referencedPath), "referenced stored path must not be listed");
      assert(listedPaths.includes(orphanPath), "aged unreferenced orphan should be listed");

      const deletedOrphan = await client.query(
        `SELECT public.delete_inbox_storage_lease($1) AS ok`,
        [orphanPath],
      );
      assert(deletedOrphan.rows[0].ok === true, "orphan delete failed");
      const deletedAgain = await client.query(
        `SELECT public.delete_inbox_storage_lease($1) AS ok`,
        [orphanPath],
      );
      assert(deletedAgain.rows[0].ok === false, "orphan delete should be idempotent false");

      const deletedRef = await client.query(
        `SELECT public.delete_inbox_storage_lease($1) AS ok`,
        [referencedPath],
      );
      assert(deletedRef.rows[0].ok === false, "referenced stored attachment must be protected");

      await client.query(`SELECT public.release_inbox_sync_lock($1::uuid, $2::uuid)`, [
        mailboxId,
        activeToken,
      ]);
    });
  });

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const entry of failures) {
      console.error(`FAIL ${entry.name}: ${entry.error?.message || entry.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
