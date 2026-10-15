/**
 * Phase 4b SQL tests: atomic attachment bind on claim_inbox_reply_send.
 * Disposable local Supabase only. Never Production. Never SMTP.
 */

import {
  assert,
  withAuthenticatedTransaction,
  withServiceRoleTransaction,
} from "./lib.mjs";

function uuid(n) {
  const hex = String(n).padStart(12, "0");
  return `cccccccc-dddd-4eee-8fff-${hex}`;
}

async function stageUpload(client, { messageId, uploadId, filename, size }) {
  const created = await client.query(
    `SELECT * FROM public.create_inbox_reply_upload(
       $1::uuid, $2::uuid, $3, $4, $5
     )`,
    [messageId, uploadId, filename, "application/pdf", size],
  );
  assert(created.rows[0].error_code == null, `stage failed: ${created.rows[0].error_code}`);
}

async function promoteStaging(serviceClient, { uploadId, adminId, size }) {
  const path = await serviceClient.query(
    `SELECT public.get_inbox_reply_upload_storage_path($1::uuid) AS path`,
    [uploadId],
  );
  assert(path.rows[0].path, "path required");
  const leased = await serviceClient.query(
    `SELECT public.register_inbox_reply_upload_lease($1::uuid, $2, $3::uuid) AS ok`,
    [uploadId, path.rows[0].path, adminId],
  );
  assert(leased.rows[0].ok === true, "lease failed");
  const committed = await serviceClient.query(
    `SELECT public.commit_inbox_reply_upload($1::uuid, $2, $3) AS ok`,
    [uploadId, "b".repeat(64), size],
  );
  assert(committed.rows[0].ok === true, "commit staging failed");
}

/**
 * @param {object} ctx
 */
export async function runInboxReplyAttachmentSendSqlTests(ctx) {
  const { env, users, mailboxId, messageId, test } = ctx;
  const to = "from@example.test";

  await test("reply-attach-send: claim binds staging uploads atomically", async () => {
    const uploadId = uuid(1);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await stageUpload(client, {
        messageId,
        uploadId,
        filename: "a.pdf",
        size: 1024,
      });
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await promoteStaging(client, { uploadId, adminId: users.admin.id, size: 1024 });
      await client.query(
        `UPDATE public.inbox_mailboxes
         SET reply_message_id_domain = COALESCE(reply_message_id_domain, 'example.test')
         WHERE id = $1`,
        [mailboxId],
      );
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const claimed = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, uuid(10), to, "Re: bind", "body with attach", [uploadId]],
      );
      assert(claimed.rows[0].error_code == null, `claim failed: ${claimed.rows[0].error_code}`);
      assert(claimed.rows[0].send_allowed === true, "send allowed");
      assert(claimed.rows[0].reply_status === "sending", "sending");

      const reply = await client.query(
        `SELECT attachment_count FROM public.inbox_replies WHERE id = $1`,
        [claimed.rows[0].reply_id],
      );
      assert(Number(reply.rows[0].attachment_count) === 1, "attachment_count=1");
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const bound = await client.query(
        `SELECT status, reply_id, bind_ordinal, retain_until
         FROM public.inbox_reply_uploads WHERE id = $1`,
        [uploadId],
      );
      assert(bound.rows[0].status === "bound", "status bound");
      assert(Number(bound.rows[0].bind_ordinal) === 1, "ordinal 1");
      assert(bound.rows[0].retain_until == null, "no retention while sending");

      const listed = await client.query(
        `SELECT upload_id, filename FROM public.list_inbox_reply_bound_uploads($1::uuid)`,
        [bound.rows[0].reply_id],
      );
      assert(listed.rows.length === 1, "list bound");
      assert(listed.rows[0].filename === "a.pdf", "filename");
    });
  });

  await test("reply-attach-send: rejects foreign/expired/uncommitted uploads", async () => {
    const foreignId = uuid(20);
    const expiredId = uuid(21);
    const uploadingId = uuid(22);

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await stageUpload(client, {
        messageId,
        uploadId: expiredId,
        filename: "e.pdf",
        size: 100,
      });
      await stageUpload(client, {
        messageId,
        uploadId: uploadingId,
        filename: "u.pdf",
        size: 100,
      });
    });
    await withAuthenticatedTransaction(env.dbUrl, users.superAdmin.id, async (client) => {
      await stageUpload(client, {
        messageId,
        uploadId: foreignId,
        filename: "f.pdf",
        size: 100,
      });
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await promoteStaging(client, {
        uploadId: expiredId,
        adminId: users.admin.id,
        size: 100,
      });
      await promoteStaging(client, {
        uploadId: foreignId,
        adminId: users.superAdmin.id,
        size: 100,
      });
      await client.query(
        `UPDATE public.inbox_reply_uploads
         SET expires_at = now() - interval '1 minute'
         WHERE id = $1`,
        [expiredId],
      );
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const cases = [
        [foreignId, "foreign", uuid(31)],
        [expiredId, "expired", uuid(32)],
        [uploadingId, "uncommitted", uuid(33)],
      ];
      for (const [id, label, key] of cases) {
        const claimed = await client.query(
          `SELECT * FROM public.claim_inbox_reply_send(
             $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
           )`,
          [messageId, key, to, "Re: bad", "body", [id]],
        );
        assert(
          claimed.rows[0].error_code === "attachment_invalid",
          `${label} must be attachment_invalid, got ${claimed.rows[0].error_code}`,
        );
        assert(claimed.rows[0].send_allowed === false, `${label} no send`);
      }
    });
  });

  await test("reply-attach-send: idempotent replay never re-sends; conflict on different set", async () => {
    const a = uuid(40);
    const b = uuid(41);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await stageUpload(client, { messageId, uploadId: a, filename: "a.pdf", size: 200 });
      await stageUpload(client, { messageId, uploadId: b, filename: "b.pdf", size: 200 });
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await promoteStaging(client, { uploadId: a, adminId: users.admin.id, size: 200 });
      await promoteStaging(client, { uploadId: b, adminId: users.admin.id, size: 200 });
    });

    const key = uuid(50);
    let replyId = null;
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const claimed = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, key, to, "Re: idem", "body", [a]],
      );
      assert(claimed.rows[0].send_allowed === true, "first claim allowed");
      replyId = claimed.rows[0].reply_id;
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const replay = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, key, to, "Re: idem", "body", [a]],
      );
      assert(replay.rows[0].already_existed === true, "replay existed");
      assert(replay.rows[0].send_allowed === false, "replay no SMTP");
      assert(replay.rows[0].error_code == null, "same set ok");
      assert(replay.rows[0].reply_id === replyId, "same reply");

      const conflict = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, key, to, "Re: idem", "body", [a, b]],
      );
      assert(
        conflict.rows[0].error_code === "idempotency_attachment_conflict",
        "conflict on different set",
      );
      assert(conflict.rows[0].send_allowed === false, "conflict no send");
    });
  });

  await test("reply-attach-send: finalize sent/failed sets retention; uncertain does not", async () => {
    const uploadId = uuid(60);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await stageUpload(client, {
        messageId,
        uploadId,
        filename: "r.pdf",
        size: 300,
      });
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await promoteStaging(client, { uploadId, adminId: users.admin.id, size: 300 });
    });

    let replyId = null;
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const claimed = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, uuid(61), to, "Re: ret", "body", [uploadId]],
      );
      replyId = claimed.rows[0].reply_id;
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      // Uncertain finalize must not set retain_until.
      await client.query(
        `UPDATE public.inbox_replies SET status = 'sending' WHERE id = $1`,
        [replyId],
      );
      // Reset upload retain
      await client.query(
        `UPDATE public.inbox_reply_uploads SET retain_until = NULL WHERE id = $1`,
        [uploadId],
      );
      // Reply is sending after claim — finalize to uncertain
      const unc = await client.query(
        `SELECT public.finalize_inbox_reply_send($1::uuid, 'uncertain', 'timeout', null) AS ok`,
        [replyId],
      );
      assert(unc.rows[0].ok === true, "uncertain finalize");
      const afterUnc = await client.query(
        `SELECT retain_until FROM public.inbox_reply_uploads WHERE id = $1`,
        [uploadId],
      );
      assert(afterUnc.rows[0].retain_until == null, "uncertain keeps retain null");

      // New claim path for sent retention: use another upload
    });

    const uploadSent = uuid(62);
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      // Uncertain blocks new keys — reconcile to failed first via service below.
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await client.query(
        `SELECT public.reconcile_inbox_reply_status($1::uuid, 'failed', 'test')`,
        [replyId],
      );
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      await stageUpload(client, {
        messageId,
        uploadId: uploadSent,
        filename: "s.pdf",
        size: 300,
      });
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      await promoteStaging(client, {
        uploadId: uploadSent,
        adminId: users.admin.id,
        size: 300,
      });
    });

    let sentReply = null;
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const claimed = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, uuid(63), to, "Re: sent", "body", [uploadSent]],
      );
      assert(claimed.rows[0].error_code == null, "claim for sent");
      sentReply = claimed.rows[0].reply_id;
    });

    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      const ok = await client.query(
        `SELECT public.finalize_inbox_reply_send($1::uuid, 'sent', null, '250 OK') AS ok`,
        [sentReply],
      );
      assert(ok.rows[0].ok === true, "sent finalize");
      const row = await client.query(
        `SELECT retain_until > now() + interval '29 days' AS ok
         FROM public.inbox_reply_uploads WHERE id = $1`,
        [uploadSent],
      );
      assert(row.rows[0].ok === true, "sent sets 30d retention");
    });
  });

  await test("reply-attach-send: quota count on claim; duplicates rejected", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => uuid(70 + i));
    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      for (const id of ids.slice(0, 5)) {
        await stageUpload(client, {
          messageId,
          uploadId: id,
          filename: `${id}.pdf`,
          size: 100,
        });
      }
    });
    await withServiceRoleTransaction(env.dbUrl, async (client) => {
      for (const id of ids.slice(0, 5)) {
        await promoteStaging(client, { uploadId: id, adminId: users.admin.id, size: 100 });
      }
    });

    await withAuthenticatedTransaction(env.dbUrl, users.admin.id, async (client) => {
      const tooMany = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, uuid(80), to, "Re: many", "body", ids.slice(0, 6)],
      );
      assert(tooMany.rows[0].error_code === "attachment_quota_count", "max 5");

      const dup = await client.query(
        `SELECT * FROM public.claim_inbox_reply_send(
           $1::uuid, $2::uuid, $3, $4, $5, $6::uuid[]
         )`,
        [messageId, uuid(81), to, "Re: dup", "body", [ids[0], ids[0]]],
      );
      assert(dup.rows[0].error_code === "attachment_duplicate", "duplicates");
    });
  });
}
