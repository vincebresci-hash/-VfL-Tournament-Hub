/**
 * Phase 4a SQL security tests for outbound reply attachment staging.
 * Disposable local Supabase only. Never Production. Never SMTP/email.
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

const CI_STATEMENT_TIMEOUT = "15s";
const CI_LOCK_TIMEOUT = "5s";

function uuid(n) {
  const hex = String(n).padStart(12, "0");
  return `bbbbbbbb-cccc-4ddd-8eee-${hex}`;
}

async function createUploadInOwnTransaction(dbUrl, userId, { parentId, uploadId, filename, mime, size }) {
  const client = createPgClient(dbUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CI_STATEMENT_TIMEOUT}'`);
    await client.query(`SET LOCAL lock_timeout = '${CI_LOCK_TIMEOUT}'`);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ]);
    await client.query("SET LOCAL ROLE authenticated");
    const result = await client.query(
      `SELECT * FROM public.create_inbox_reply_upload(
         $1::uuid, $2::uuid, $3, $4, $5
       )`,
      [parentId, uploadId, filename, mime, size],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * @param {object} ctx
 * @param {object} ctx.env
 * @param {object} ctx.users
 * @param {string} ctx.mailboxId
 * @param {string} ctx.messageId
 * @param {(name: string, fn: Function) => Promise<void>} ctx.test
 */
export async function runInboxReplyAttachmentSqlTests(ctx) {
  const { env, users, mailboxId, messageId, test } = ctx;

  await test("reply-attach-schema: uploads + leases + bucket + RPCs", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      for (const name of ["inbox_reply_uploads", "inbox_reply_upload_leases"]) {
        const table = await client.query(
          `SELECT c.relrowsecurity AS rls
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
          [name],
        );
        assert(table.rows.length === 1, `${name} missing`);
        assert(table.rows[0].rls === true, `${name} RLS disabled`);
      }

      const bucket = await client.query(
        `SELECT id, public, file_size_limit
         FROM storage.buckets WHERE id = 'inbox-reply-attachments'`,
      );
      assert(bucket.rows.length === 1, "bucket missing");
      assert(bucket.rows[0].public === false, "bucket must be private");
      assert(Number(bucket.rows[0].file_size_limit) === 5242880, "bucket 5 MiB limit");

      const policies = await client.query(
        `SELECT policyname FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND (
             qual ILIKE '%inbox-reply-attachments%'
             OR with_check ILIKE '%inbox-reply-attachments%'
           )`,
      );
      assert(policies.rows.length === 0, "no storage.objects policies for reply bucket");

      for (const name of [
        "create_inbox_reply_upload",
        "remove_inbox_reply_upload",
        "get_inbox_reply_upload_storage_path",
        "register_inbox_reply_upload_lease",
        "commit_inbox_reply_upload",
        "reject_inbox_reply_upload",
        "list_purgeable_inbox_reply_uploads",
        "mark_inbox_reply_upload_purged",
        "set_inbox_reply_upload_retention",
      ]) {
        const { rows } = await client.query(
          `SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = $1`,
          [name],
        );
        assert(rows.length >= 1, `missing RPC ${name}`);
      }

      const range = await client.query(
        `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = 'inbox_replies'
           AND c.conname = 'inbox_replies_attachment_count_range'`,
      );
      assert(range.rows.length === 1, "attachment_count range missing");
      assert(range.rows[0].def.includes("5"), "attachment_count max 5");
    });
  });

  await test("reply-attach-authz: service_role-only maintenance + helpers", async () => {
    await withPostgresTransaction(env.dbUrl, async (client) => {
      const fns = [
        ["get_inbox_reply_upload_storage_path(uuid)", "get_inbox_reply_upload_storage_path"],
        ["register_inbox_reply_upload_lease(uuid,text,uuid)", "register_inbox_reply_upload_lease"],
        ["commit_inbox_reply_upload(uuid,text,integer)", "commit_inbox_reply_upload"],
        ["reject_inbox_reply_upload(uuid,text)", "reject_inbox_reply_upload"],
        ["list_purgeable_inbox_reply_uploads(integer)", "list_purgeable_inbox_reply_uploads"],
        ["mark_inbox_reply_upload_purged(uuid,text)", "mark_inbox_reply_upload_purged"],
        ["set_inbox_reply_upload_retention(uuid,integer)", "set_inbox_reply_upload_retention"],
        ["is_inbox_reply_upload_mime_allowed(text,text)", "is_inbox_reply_upload_mime_allowed"],
        ["inbox_reply_upload_extension(text)", "inbox_reply_upload_extension"],
      ];
      for (const [identity, label] of fns) {
        const { rows } = await client.query(
          `SELECT
             has_function_privilege('service_role', $1::text, 'EXECUTE') AS service_ok,
             has_function_privilege('authenticated', $1::text, 'EXECUTE') AS auth_ok,
             has_function_privilege('anon', $1::text, 'EXECUTE') AS anon_ok`,
          [`public.${identity}`],
        );
        // Helpers are revoked from everyone including service_role (used only inside DEFINER).
        if (
          label === "is_inbox_reply_upload_mime_allowed" ||
          label === "inbox_reply_upload_extension"
        ) {
          assert(rows[0].auth_ok === false, `${label} must not grant authenticated`);
          assert(rows[0].anon_ok === false, `${label} must not grant anon`);
          continue;
        }
        assert(rows[0].service_ok === true, `${label} missing service_role execute`);
        assert(rows[0].auth_ok === false, `${label} must not grant authenticated`);
        assert(rows[0].anon_ok === false, `${label} must not grant anon`);
      }
    });
  });

  await test("reply-attach: admin can stage; CM forbidden; cross-user blocked", async () => {
    const uploadId = uuid(401);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const created = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uploadId, "plan.pdf", "application/pdf", 1024],
      );
      assert(created.rows[0].error_code == null, `create failed: ${created.rows[0].error_code}`);
      assert(created.rows[0].upload_id === uploadId, "upload id mismatch");
      assert(
        !Object.prototype.hasOwnProperty.call(created.rows[0], "storage_path") ||
          created.rows[0].storage_path === undefined,
        "create must not return storage_path to authenticated",
      );
    });

    await withAuthenticatedTransaction(
      env.dbUrl,
      users.communicationManager.id,
      async (client) => {
        const created = await client.query(
          `SELECT * FROM public.create_inbox_reply_upload(
             $1::uuid, $2::uuid, $3, $4, $5
           )`,
          [messageId, uuid(402), "plan.pdf", "application/pdf", 1024],
        );
        assert(
          created.rows[0].error_code === "not_authorized_reply" ||
            created.rows[0].error_code === "not_authorized_view",
          `CM must be denied, got ${created.rows[0].error_code}`,
        );
      },
    );

    await withAuthenticatedTransaction(env.dbUrl, users.superAdmin.id, async (client) => {
      const removed = await client.query(
        `SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`,
        [uploadId],
      );
      assert(removed.rows[0].ok === false, "other actor must not remove");
      assert(removed.rows[0].error_code === "forbidden", "expected forbidden");
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const visible = await client.query(
        `SELECT id, status FROM public.inbox_reply_uploads WHERE id = $1::uuid`,
        [uploadId],
      );
      assert(visible.rows.length === 1, "owner can select own upload");

      const removed = await client.query(
        `SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`,
        [uploadId],
      );
      assert(removed.rows[0].ok === true, "owner remove failed");
      assert(
        !Object.prototype.hasOwnProperty.call(removed.rows[0], "storage_path") ||
          removed.rows[0].storage_path === undefined,
        "remove must not return storage_path",
      );
    });
  });

  await test("reply-attach H3/M6: storage_path hidden; cross-user SELECT isolation", async () => {
    const uploadId = uuid(410);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const created = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uploadId, "secret.pdf", "application/pdf", 2048],
      );
      assert(created.rows[0].error_code == null, "create failed");
    });

    // Same-user must not be able to SELECT storage_path column.
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await expectError(
        () =>
          client.query(
            `SELECT storage_path FROM public.inbox_reply_uploads WHERE id = $1::uuid`,
            [uploadId],
          ),
        (error) =>
          isPermissionDenied(error) ||
          /permission denied for column|column .*storage_path/i.test(String(error?.message || error)),
        "authenticated must not SELECT storage_path",
      );

      const meta = await client.query(
        `SELECT id, filename, status FROM public.inbox_reply_uploads WHERE id = $1::uuid`,
        [uploadId],
      );
      assert(meta.rows.length === 1, "owner can read metadata without path");
    });

    // Cross-user cannot see live staging row at all (M6).
    await withAuthenticatedTransaction(env.dbUrl, users.superAdmin.id, async (client) => {
      const hidden = await client.query(
        `SELECT id, filename, status FROM public.inbox_reply_uploads WHERE id = $1::uuid`,
        [uploadId],
      );
      assert(hidden.rows.length === 0, "other actor must not SELECT live staging");
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await expectError(
        () =>
          client.query(`SELECT public.get_inbox_reply_upload_storage_path($1::uuid)`, [uploadId]),
        isPermissionDenied,
        "authenticated must not get storage path RPC",
      );
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const path = await client.query(
        `SELECT public.get_inbox_reply_upload_storage_path($1::uuid) AS path`,
        [uploadId],
      );
      assert(typeof path.rows[0].path === "string", "service_role can read path");
      assert(path.rows[0].path.includes(users.admin.id), "path includes owner");
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await client.query(`SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`, [uploadId]);
    });
  });

  await test("reply-attach H5: SQL MIME allowlist vs extension", async () => {
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const mismatch = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uuid(420), "x.pdf", "image/png", 100],
      );
      assert(mismatch.rows[0].error_code === "mime_blocked", "pdf+png mime blocked");

      const docxBad = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uuid(421), "x.docx", "application/pdf", 100],
      );
      assert(docxBad.rows[0].error_code === "mime_blocked", "docx+pdf mime blocked");

      const ok = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [
          messageId,
          uuid(422),
          "ok.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          100,
        ],
      );
      assert(ok.rows[0].error_code == null, "valid docx mime accepted");
      await client.query(`SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`, [uuid(422)]);
    });
  });

  await test("reply-attach: quotas + extension + size gates", async () => {
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        const id = uuid(500 + i);
        ids.push(id);
        const created = await client.query(
          `SELECT * FROM public.create_inbox_reply_upload(
             $1::uuid, $2::uuid, $3, $4, $5
           )`,
          [messageId, id, `f${i}.pdf`, "application/pdf", 1024],
        );
        assert(created.rows[0].error_code == null, `create ${i} failed`);
      }
      const sixth = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uuid(599), "overflow.pdf", "application/pdf", 1024],
      );
      assert(sixth.rows[0].error_code === "quota_count", "6th file must hit quota_count");

      for (const id of ids) {
        await client.query(`SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`, [id]);
      }

      const tooBig = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uuid(610), "huge.pdf", "application/pdf", 5242881],
      );
      assert(tooBig.rows[0].error_code === "size_rejected", "over 5 MiB rejected");

      const badExt = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uuid(611), "x.exe", "application/octet-stream", 100],
      );
      assert(badExt.rows[0].error_code === "extension_blocked", "exe blocked");

      const a = uuid(620);
      const b = uuid(621);
      const c = uuid(622);
      const d = uuid(623);
      for (const [id, size] of [
        [a, 4 * 1024 * 1024],
        [b, 4 * 1024 * 1024],
        [c, 4 * 1024 * 1024],
      ]) {
        const created = await client.query(
          `SELECT * FROM public.create_inbox_reply_upload(
             $1::uuid, $2::uuid, $3, $4, $5
           )`,
          [messageId, id, `${id}.pdf`, "application/pdf", size],
        );
        assert(created.rows[0].error_code == null, "4MiB chunk should fit");
      }
      const overTotal = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, d, "over.pdf", "application/pdf", 1024],
      );
      assert(overTotal.rows[0].error_code === "quota_bytes", "total 12 MiB enforced");

      for (const id of [a, b, c]) {
        await client.query(`SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`, [id]);
      }
    });
  });

  await test("reply-attach H2: concurrent creates cannot exceed count quota", async () => {
    // Clean slate for parent+admin staging.
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `DELETE FROM public.inbox_reply_uploads
         WHERE created_by = $1::uuid AND parent_message_id = $2::uuid
           AND status IN ('uploading', 'staging')`,
        [users.admin.id, messageId],
      );
    });

    const ids = Array.from({ length: 8 }, (_, i) => uuid(700 + i));
    const results = await Promise.all(
      ids.map((uploadId, index) =>
        createUploadInOwnTransaction(env.dbUrl, users.admin.id, {
          parentId: messageId,
          uploadId,
          filename: `c${index}.pdf`,
          mime: "application/pdf",
          size: 1024,
        }),
      ),
    );

    const accepted = results.filter((row) => row.error_code == null);
    const rejected = results.filter((row) => row.error_code === "quota_count");
    assert(accepted.length === 5, `expected 5 accepted, got ${accepted.length}`);
    assert(rejected.length === 3, `expected 3 quota_count, got ${rejected.length}`);

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const count = await client.query(
        `SELECT count(*)::int AS n FROM public.inbox_reply_uploads
         WHERE created_by = $1::uuid AND parent_message_id = $2::uuid
           AND status IN ('uploading', 'staging')`,
        [users.admin.id, messageId],
      );
      assert(count.rows[0].n === 5, "DB must hold exactly 5 staging rows");
      await client.query(
        `DELETE FROM public.inbox_reply_uploads
         WHERE created_by = $1::uuid AND parent_message_id = $2::uuid`,
        [users.admin.id, messageId],
      );
    });
  });

  await test("reply-attach: lease required for commit; bad checksum rejected", async () => {
    const uploadId = uuid(750);
    let storagePath = null;

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const created = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uploadId, "lease.pdf", "application/pdf", 2048],
      );
      assert(created.rows[0].error_code == null, "create for lease test failed");
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const pathRow = await client.query(
        `SELECT public.get_inbox_reply_upload_storage_path($1::uuid) AS path`,
        [uploadId],
      );
      storagePath = pathRow.rows[0].path;

      const commitNoLease = await client.query(
        `SELECT public.commit_inbox_reply_upload($1::uuid, $2, $3) AS ok`,
        [uploadId, "a".repeat(64), 2048],
      );
      assert(commitNoLease.rows[0].ok === false, "commit without lease must fail");

      const leased = await client.query(
        `SELECT public.register_inbox_reply_upload_lease($1::uuid, $2, $3::uuid) AS ok`,
        [uploadId, storagePath, users.admin.id],
      );
      assert(leased.rows[0].ok === true, "service_role lease failed");

      const badChecksum = await client.query(
        `SELECT public.commit_inbox_reply_upload($1::uuid, $2, $3) AS ok`,
        [uploadId, "not-hex", 2048],
      );
      assert(badChecksum.rows[0].ok === false, "non-hex checksum rejected");

      const committed = await client.query(
        `SELECT public.commit_inbox_reply_upload($1::uuid, $2, $3) AS ok`,
        [uploadId, "a".repeat(64), 2048],
      );
      assert(committed.rows[0].ok === true, "commit failed");

      const status = await client.query(
        `SELECT status, checksum_sha256 FROM public.inbox_reply_uploads WHERE id = $1`,
        [uploadId],
      );
      assert(status.rows[0].status === "staging", "status should be staging");
      assert(status.rows[0].checksum_sha256 === "a".repeat(64), "checksum stored");
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await expectError(
        () =>
          client.query(
            `SELECT public.register_inbox_reply_upload_lease($1::uuid, $2, $3::uuid)`,
            [uploadId, storagePath, users.admin.id],
          ),
        isPermissionDenied,
        "authenticated must not register lease",
      );
      await client.query(`SELECT * FROM public.remove_inbox_reply_upload($1::uuid)`, [uploadId]);
    });
  });

  await test("reply-attach H1: mark_purged refuses in-retention / sending / uncertain", async () => {
    const expiredId = uuid(800);
    const retainedId = uuid(801);
    const sendingId = uuid(802);
    const uncertainId = uuid(803);

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      for (const [id, name] of [
        [expiredId, "expired.pdf"],
        [retainedId, "retain.pdf"],
        [sendingId, "sending.pdf"],
        [uncertainId, "uncertain.pdf"],
      ]) {
        const created = await client.query(
          `SELECT * FROM public.create_inbox_reply_upload(
             $1::uuid, $2::uuid, $3, $4, $5
           )`,
          [messageId, id, name, "application/pdf", 512],
        );
        assert(created.rows[0].error_code == null, "create purge fixture failed");
      }
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_mailboxes
         SET reply_message_id_domain = COALESCE(reply_message_id_domain, 'example.test')
         WHERE id = $1`,
        [mailboxId],
      );

      // Create sending + uncertain replies for bind fixtures.
      const sendingReply = await client.query(
        `INSERT INTO public.inbox_replies (
           mailbox_id, parent_message_id, idempotency_key, to_address, subject, body_text,
           message_id_header, status, created_by, attachment_count
         ) VALUES (
           $1, $2, $3, 'from@example.test', 'Re: send', 'body',
           '<a@example.test>', 'sending', $4, 0
         ) RETURNING id`,
        [mailboxId, messageId, uuid(810), users.admin.id],
      );
      const uncertainReply = await client.query(
        `INSERT INTO public.inbox_replies (
           mailbox_id, parent_message_id, idempotency_key, to_address, subject, body_text,
           message_id_header, status, created_by, attachment_count
         ) VALUES (
           $1, $2, $3, 'from@example.test', 'Re: unc', 'body',
           '<b@example.test>', 'uncertain', $4, 0
         ) RETURNING id`,
        [mailboxId, messageId, uuid(811), users.admin.id],
      );

      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET expires_at = now() - interval '1 minute', status = 'staging'
         WHERE id = $1`,
        [expiredId],
      );
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET status = 'bound', bound_at = now(),
             retain_until = now() + interval '10 days'
         WHERE id = $1`,
        [retainedId],
      );
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET status = 'bound', bound_at = now(), reply_id = $2,
             retain_until = now() - interval '1 minute'
         WHERE id = $1`,
        [sendingId, sendingReply.rows[0].id],
      );
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET status = 'bound', bound_at = now(), reply_id = $2,
             retain_until = now() - interval '1 minute'
         WHERE id = $1`,
        [uncertainId, uncertainReply.rows[0].id],
      );

      const listed = await client.query(
        `SELECT upload_id::text, reason FROM public.list_purgeable_inbox_reply_uploads(50)`,
      );
      const byId = new Map(listed.rows.map((row) => [row.upload_id, row.reason]));
      assert(byId.get(expiredId) === "staging_expired", "expired staging listed");
      assert(!byId.has(retainedId), "in-retention bound must not list");
      assert(!byId.has(sendingId), "sending-bound must not list");
      assert(!byId.has(uncertainId), "uncertain-bound must not list");

      const refuseRetain = await client.query(
        `SELECT public.mark_inbox_reply_upload_purged($1::uuid, 'retention_elapsed') AS ok`,
        [retainedId],
      );
      assert(refuseRetain.rows[0].ok === false, "in-retention mark must fail");

      const refuseSending = await client.query(
        `SELECT public.mark_inbox_reply_upload_purged($1::uuid, 'retention_elapsed') AS ok`,
        [sendingId],
      );
      assert(refuseSending.rows[0].ok === false, "sending mark must fail");

      const refuseUncertain = await client.query(
        `SELECT public.mark_inbox_reply_upload_purged($1::uuid, 'retention_elapsed') AS ok`,
        [uncertainId],
      );
      assert(refuseUncertain.rows[0].ok === false, "uncertain mark must fail");

      const marked = await client.query(
        `SELECT public.mark_inbox_reply_upload_purged($1::uuid, 'staging_expired') AS ok`,
        [expiredId],
      );
      assert(marked.rows[0].ok === true, "expired staging mark ok");

      // After reply leaves uncertain, retention-elapsed bound becomes purgeable.
      await client.query(
        `UPDATE public.inbox_replies SET status = 'failed' WHERE id = $1`,
        [uncertainReply.rows[0].id],
      );
      const after = await client.query(
        `SELECT public.mark_inbox_reply_upload_purged($1::uuid, 'retention_elapsed') AS ok`,
        [uncertainId],
      );
      assert(after.rows[0].ok === true, "failed reply retention-elapsed purgeable");

      // Cleanup fixtures
      for (const id of [retainedId, sendingId]) {
        await client.query(
          `UPDATE public.inbox_reply_uploads
           SET status = 'purged', storage_path = NULL, purged_at = now()
           WHERE id = $1`,
          [id],
        );
      }
      await client.query(`DELETE FROM public.inbox_replies WHERE id = ANY($1::uuid[])`, [
        [sendingReply.rows[0].id, uncertainReply.rows[0].id],
      ]);
    });
  });

  await test("reply-attach: retention floor is 30 days", async () => {
    const uploadId = uuid(850);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const created = await client.query(
        `SELECT * FROM public.create_inbox_reply_upload(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, uploadId, "ret.pdf", "application/pdf", 100],
      );
      assert(created.rows[0].error_code == null, "create failed");
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET status = 'bound', bound_at = now()
         WHERE id = $1`,
        [uploadId],
      );
      const ok = await client.query(
        `SELECT public.set_inbox_reply_upload_retention($1::uuid, 1) AS ok`,
        [uploadId],
      );
      assert(ok.rows[0].ok === true, "retention set");
      const row = await client.query(
        `SELECT retain_until > now() + interval '29 days' AS long_enough
         FROM public.inbox_reply_uploads WHERE id = $1`,
        [uploadId],
      );
      assert(row.rows[0].long_enough === true, "retain_days=1 must clamp to >=30");
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET status = 'purged', storage_path = NULL WHERE id = $1`,
        [uploadId],
      );
    });
  });

  await test("reply-attach: claim still inserts attachment_count 0; idempotency intact", async () => {
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `UPDATE public.inbox_mailboxes
         SET reply_message_id_domain = COALESCE(reply_message_id_domain, 'example.test')
         WHERE id = $1`,
        [mailboxId],
      );
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const key = uuid(900);
      const claimed = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5
         )`,
        [messageId, key, "from@example.test", "Re: attach-foundation", "body"],
      );
      assert(claimed.rows[0].error_code == null, `claim failed: ${claimed.rows[0].error_code}`);
      assert(claimed.rows[0].send_allowed === true, "send should be allowed");

      const reply = await client.query(
        `SELECT attachment_count, status FROM public.inbox_replies WHERE id = $1`,
        [claimed.rows[0].reply_id],
      );
      assert(Number(reply.rows[0].attachment_count) === 0, "Phase 4a claim still count 0");
      assert(reply.rows[0].status === "sending", "claim status sending");
    });
  });

  await test("reply-attach: authenticated cannot INSERT/UPDATE uploads directly", async () => {
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await expectError(
        () =>
          client.query(
            `INSERT INTO public.inbox_reply_uploads (
               id, mailbox_id, parent_message_id, created_by, filename, content_type,
               size_bytes, storage_path, status, expires_at
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'x.pdf', 'application/pdf',
               10, 'nope', 'staging', now() + interval '1 hour'
             )`,
            [uuid(950), mailboxId, messageId, users.admin.id],
          ),
        isPermissionDenied,
        "direct insert must fail",
      );
    });
  });
}
