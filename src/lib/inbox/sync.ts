import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  INBOX_ATTACHMENT_BUCKET,
  INBOX_ATTACHMENT_MAX_REPAIR_ATTEMPTS,
  INBOX_ATTACHMENT_REPAIR_BATCH,
  INBOX_BACKFILL_DAYS,
  INBOX_FETCH_MIN_REMAINING_MS,
  INBOX_IMAP_OPERATION_TIMEOUT_MS,
  INBOX_ORPHAN_CLEANUP_BATCH,
  INBOX_ORPHAN_LEASE_MAX_AGE_SECONDS,
  INBOX_SYNC_BATCH_SIZE,
  INBOX_SYNC_LOCK_TTL_SECONDS,
  INBOX_SYNC_TIME_BUDGET_MS,
  canStartInboxFetch,
  readInboxImapConfig,
  remainingBudgetMs,
  type InboxImapConfig,
} from "@/lib/inbox/config";
import {
  filterUidsAfterCursor,
  isUidvalidityReset,
  nextCursorAfterBatch,
} from "@/lib/inbox/identity";
import { fetchInboxFolderSnapshot, fetchInboxMessagesByUid } from "@/lib/inbox/imap-client";
import { parseInboxFetchItem } from "@/lib/inbox/parse-message";
import { buildInboxAttachmentStoragePath } from "@/lib/inbox/attachments-safe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { InboxSyncBatchResult, ParsedInboxMessage } from "@/lib/inbox/types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

function logInboxSync(event: string, detail?: Record<string, unknown>) {
  // Never log message bodies, credentials, or attachment bytes.
  console.info("[inbox-sync]", event, detail ?? {});
}

function checksumSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function ensureMailboxAndState(supabase: ServiceClient, folder: string) {
  const { data: existing } = await supabase
    .from("inbox_mailboxes")
    .select("id, folder")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let mailboxId = existing?.id as string | undefined;
  if (!mailboxId) {
    const { data: created, error } = await supabase
      .from("inbox_mailboxes")
      .insert({ label: "Tournament Hub", folder, is_active: true })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error("Postfach konnte nicht angelegt werden.");
    }
    mailboxId = created.id;
  } else if (existing?.folder && existing.folder !== folder) {
    throw new Error(
      `Mailbox-Ordner-Konfiguration stimmt nicht überein (DB: ${existing.folder}, ENV: ${folder}).`,
    );
  }

  const { data: state } = await supabase
    .from("inbox_sync_state")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();

  if (!state) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - INBOX_BACKFILL_DAYS);
    const { error } = await supabase.from("inbox_sync_state").insert({
      mailbox_id: mailboxId,
      folder,
      cursor_uid: 0,
      backfill_cutoff_at: cutoff.toISOString(),
      backfill_complete: false,
    });
    if (error) {
      throw new Error("Sync-Status konnte nicht angelegt werden.");
    }
  } else {
    if (state.folder && state.folder !== folder) {
      throw new Error(
        `Sync-Status-Ordner stimmt nicht überein (DB: ${state.folder}, ENV: ${folder}).`,
      );
    }
    if (!state.backfill_cutoff_at) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - INBOX_BACKFILL_DAYS);
      await supabase
        .from("inbox_sync_state")
        .update({ backfill_cutoff_at: cutoff.toISOString(), folder })
        .eq("mailbox_id", mailboxId);
    }
  }

  const { data: fresh, error: freshError } = await supabase
    .from("inbox_sync_state")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .single();

  if (freshError || !fresh) {
    throw new Error("Sync-Status fehlt.");
  }

  return { mailboxId, state: fresh };
}

async function persistAttachmentsForMessage(input: {
  supabase: ServiceClient;
  mailboxId: string;
  lockToken: string;
  messageId: string;
  parsed: ParsedInboxMessage;
}): Promise<{ ok: boolean; lockLost: boolean }> {
  const { supabase, mailboxId, lockToken, messageId, parsed } = input;

  for (let partIndex = 0; partIndex < parsed.attachments.length; partIndex += 1) {
    const attachment = parsed.attachments[partIndex];
    if (!attachment) {
      continue;
    }

    const { data: existingRows } = await supabase
      .from("inbox_attachments")
      .select("id, stored, storage_path, checksum_sha256, size_bytes, filename, skip_reason")
      .eq("message_id", messageId)
      .eq("part_index", partIndex)
      .limit(1);

    const existing = existingRows?.[0];
    if (
      existing?.stored &&
      existing.storage_path &&
      existing.filename === attachment.filename &&
      existing.size_bytes === attachment.sizeBytes &&
      (!attachment.content ||
        !existing.checksum_sha256 ||
        existing.checksum_sha256 === checksumSha256(attachment.content))
    ) {
      // Working attachment already durable — leave it alone.
      continue;
    }

    let storagePath: string | null = null;
    let storedFlag = false;
    let skipReason = attachment.skipReason;
    let checksum: string | null = null;
    const attachmentId = existing?.id ?? randomUUID();

    if (attachment.content && !skipReason) {
      checksum = checksumSha256(attachment.content);
      storagePath = buildInboxAttachmentStoragePath({
        mailboxId,
        messageId,
        attachmentId,
        filename: attachment.filename,
      });

      const { error: leaseError } = await supabase.rpc("register_inbox_storage_lease", {
        p_mailbox_id: mailboxId,
        p_lock_token: lockToken,
        p_storage_path: storagePath,
        p_message_id: messageId,
        p_attachment_id: attachmentId,
      });
      if (leaseError) {
        return {
          ok: false,
          lockLost: /lock lost/i.test(leaseError.message ?? ""),
        };
      }

      const { error: uploadError } = await supabase.storage
        .from(INBOX_ATTACHMENT_BUCKET)
        .upload(storagePath, attachment.content, {
          contentType: "application/octet-stream",
          upsert: true,
        });
      if (uploadError) {
        // Lease remains uncommitted for orphan GC. Never delete a prior working blob.
        storagePath = null;
        skipReason = "storage_upload_failed";
        storedFlag = false;
      } else {
        storedFlag = true;
      }
    }

    const { data: upserted, error: upsertError } = await supabase.rpc(
      "upsert_inbox_attachment_from_sync",
      {
        p_mailbox_id: mailboxId,
        p_lock_token: lockToken,
        p_message_id: messageId,
        p_part_index: partIndex,
        p_filename: attachment.filename,
        p_content_type: attachment.contentType,
        p_size_bytes: attachment.sizeBytes,
        p_content_id: attachment.contentId,
        p_storage_path: storagePath,
        p_checksum_sha256: checksum,
        p_stored: storedFlag,
        p_skip_reason: skipReason,
      },
    );

    if (upsertError) {
      const lockLost = /lock lost/i.test(upsertError.message ?? "");
      // If lock was lost after a successful upload, leave the new blob for orphan GC.
      return { ok: false, lockLost };
    }

    if (storedFlag && storagePath) {
      await supabase.rpc("commit_inbox_storage_lease", {
        p_mailbox_id: mailboxId,
        p_lock_token: lockToken,
        p_storage_path: storagePath,
      });
    }

    const row = Array.isArray(upserted) ? upserted[0] : upserted;
    const previousPath =
      row && typeof row === "object" && "previous_storage_path" in row
        ? (row.previous_storage_path as string | null)
        : null;
    if (previousPath && previousPath !== storagePath) {
      await supabase.storage.from(INBOX_ATTACHMENT_BUCKET).remove([previousPath]);
    }
  }

  return { ok: true, lockLost: false };
}

async function storeParsedMessage(input: {
  supabase: ServiceClient;
  mailboxId: string;
  lockToken: string;
  folder: string;
  uidvalidity: number;
  parsed: ParsedInboxMessage;
}): Promise<{ messageId: string | null; lockLost: boolean; error: string | null }> {
  const { supabase, mailboxId, lockToken, folder, uidvalidity, parsed } = input;
  const { data: messageId, error: upsertError } = await supabase.rpc(
    "upsert_inbox_message_from_sync",
    {
      p_mailbox_id: mailboxId,
      p_lock_token: lockToken,
      p_folder: folder,
      p_uidvalidity: uidvalidity,
      p_imap_uid: parsed.imapUid,
      p_message_id_header: parsed.messageIdHeader,
      p_in_reply_to: parsed.inReplyTo,
      p_references_header: parsed.referencesHeader,
      p_thread_key: parsed.threadKey,
      p_from_address: parsed.fromAddress,
      p_from_name: parsed.fromName,
      p_to_addresses: parsed.toAddresses,
      p_cc_addresses: parsed.ccAddresses,
      p_subject: parsed.subject,
      p_sent_at: parsed.sentAt,
      p_received_at: parsed.receivedAt,
      p_snippet: parsed.snippet,
      p_body_text: parsed.bodyText,
      p_body_html_sanitized: parsed.bodyHtmlSanitized,
      p_has_attachments: parsed.hasAttachments,
      p_size_bytes: parsed.sizeBytes,
      p_imap_flags: parsed.imapFlags,
    },
  );

  if (upsertError || !messageId) {
    const lockLost = /lock lost/i.test(upsertError?.message ?? "");
    return {
      messageId: null,
      lockLost,
      error: lockLost
        ? "Sync-Lock verloren (stale worker)."
        : "Nachricht konnte nicht gespeichert werden.",
    };
  }

  const attachmentResult = await persistAttachmentsForMessage({
    supabase,
    mailboxId,
    lockToken,
    messageId: String(messageId),
    parsed,
  });

  if (attachmentResult.lockLost) {
    return {
      messageId: String(messageId),
      lockLost: true,
      error: "Sync-Lock verloren während Anhang-Speicherung.",
    };
  }

  return { messageId: String(messageId), lockLost: false, error: null };
}

async function cleanupOrphanStorageLeases(input: {
  supabase: ServiceClient;
  started: number;
  timeBudgetMs: number;
}): Promise<number> {
  const { supabase, started, timeBudgetMs } = input;
  if (remainingBudgetMs(started, timeBudgetMs) < 1_000) {
    return 0;
  }

  const { data: expired, error } = await supabase.rpc("list_expired_inbox_storage_leases", {
    p_max_age_seconds: INBOX_ORPHAN_LEASE_MAX_AGE_SECONDS,
    p_limit: INBOX_ORPHAN_CLEANUP_BATCH,
  });
  if (error || !expired?.length) {
    return 0;
  }

  let cleaned = 0;
  for (const lease of expired) {
    if (remainingBudgetMs(started, timeBudgetMs) < 500) {
      break;
    }
    const path = lease.storage_path as string;
    // Double-check: never delete a path still referenced by a stored attachment.
    const { data: referenced } = await supabase
      .from("inbox_attachments")
      .select("id")
      .eq("storage_path", path)
      .eq("stored", true)
      .limit(1);
    if (referenced?.length) {
      continue;
    }

    await supabase.storage.from(INBOX_ATTACHMENT_BUCKET).remove([path]);
    const { data: deleted } = await supabase.rpc("delete_inbox_storage_lease", {
      p_storage_path: path,
    });
    if (deleted) {
      cleaned += 1;
    }
  }
  return cleaned;
}

async function repairFailedAttachments(input: {
  supabase: ServiceClient;
  config: InboxImapConfig;
  mailboxId: string;
  lockToken: string;
  uidvalidity: number;
  folder: string;
  started: number;
  timeBudgetMs: number;
}): Promise<{ repaired: number; lockLost: boolean; timedOut: boolean }> {
  const { supabase, config, mailboxId, lockToken, uidvalidity, folder, started, timeBudgetMs } =
    input;

  if (!canStartInboxFetch(started, timeBudgetMs)) {
    return { repaired: 0, lockLost: false, timedOut: true };
  }

  const { data: broken } = await supabase
    .from("inbox_attachments")
    .select("id, message_id, skip_reason, retry_count, last_repair_at")
    .eq("stored", false)
    .in("skip_reason", ["storage_upload_failed", "missing_content"])
    .lt("retry_count", INBOX_ATTACHMENT_MAX_REPAIR_ATTEMPTS)
    .order("last_repair_at", { ascending: true, nullsFirst: true })
    .limit(INBOX_ATTACHMENT_REPAIR_BATCH * 4);

  const messageIds = [...new Set((broken ?? []).map((row) => row.message_id))];
  if (messageIds.length === 0) {
    return { repaired: 0, lockLost: false, timedOut: false };
  }

  const { data: messages } = await supabase
    .from("inbox_messages")
    .select("id, imap_uid")
    .in("id", messageIds)
    .eq("mailbox_id", mailboxId)
    .eq("uidvalidity", uidvalidity)
    .limit(INBOX_ATTACHMENT_REPAIR_BATCH);

  const messageByUid = new Map<number, string>();
  for (const row of messages ?? []) {
    const uid = Number(row.imap_uid);
    if (Number.isFinite(uid)) {
      messageByUid.set(uid, row.id);
    }
  }
  const uids = [...messageByUid.keys()];

  if (uids.length === 0) {
    return { repaired: 0, lockLost: false, timedOut: false };
  }

  const attachmentsForRepair = (broken ?? []).filter((row) =>
    [...messageByUid.values()].includes(row.message_id),
  );

  // One bookkeeping bump per attachment per repair cycle (codes only — no bodies).
  for (const row of attachmentsForRepair) {
    const { error: markError } = await supabase.rpc("mark_inbox_attachment_repair_attempt", {
      p_mailbox_id: mailboxId,
      p_lock_token: lockToken,
      p_attachment_id: row.id,
      p_error_code: "repair_attempt",
    });
    if (markError && /lock lost/i.test(markError.message ?? "")) {
      return { repaired: 0, lockLost: true, timedOut: false };
    }
  }

  const remaining = remainingBudgetMs(started, timeBudgetMs);
  const opTimeout = Math.max(
    1_000,
    Math.min(INBOX_IMAP_OPERATION_TIMEOUT_MS, remaining - 500),
  );

  let fetched;
  try {
    fetched = await fetchInboxMessagesByUid(config, uids, { operationTimeoutMs: opTimeout });
  } catch {
    return { repaired: 0, lockLost: false, timedOut: true };
  }

  let repaired = 0;
  for (const item of fetched.fetched) {
    if (!canStartInboxFetch(started, timeBudgetMs)) {
      return { repaired, lockLost: false, timedOut: true };
    }
    const parsed = await parseInboxFetchItem(item);
    const result = await storeParsedMessage({
      supabase,
      mailboxId,
      lockToken,
      folder,
      uidvalidity,
      parsed,
    });
    if (result.lockLost) {
      return { repaired, lockLost: true, timedOut: false };
    }
    if (result.messageId) {
      const { data: stillBroken } = await supabase
        .from("inbox_attachments")
        .select("id")
        .eq("message_id", result.messageId)
        .eq("stored", false)
        .in("skip_reason", ["storage_upload_failed", "missing_content"])
        .limit(1);
      if (!stillBroken?.length) {
        repaired += 1;
      }
    }
  }

  return { repaired, lockLost: false, timedOut: false };
}

export async function runInboxSyncBatch(options?: {
  config?: InboxImapConfig | null;
  timeBudgetMs?: number;
  batchSize?: number;
}): Promise<InboxSyncBatchResult> {
  const started = Date.now();
  const timeBudgetMs = options?.timeBudgetMs ?? INBOX_SYNC_TIME_BUDGET_MS;
  const batchSize = options?.batchSize ?? INBOX_SYNC_BATCH_SIZE;
  const config = options?.config === undefined ? readInboxImapConfig() : options.config;

  if (!config) {
    return {
      processed: 0,
      stored: 0,
      skippedLocked: false,
      backfillComplete: false,
      cursorUid: 0,
      uidvalidity: null,
      error: "IMAP-Konfiguration fehlt.",
      timedOut: false,
    };
  }

  const supabase = createServiceRoleClient();
  let mailboxId: string;
  let state: Record<string, unknown>;
  try {
    const ensured = await ensureMailboxAndState(supabase, config.folder);
    mailboxId = ensured.mailboxId;
    state = ensured.state as Record<string, unknown>;
  } catch (ensureError) {
    return {
      processed: 0,
      stored: 0,
      skippedLocked: false,
      backfillComplete: false,
      cursorUid: 0,
      uidvalidity: null,
      error: ensureError instanceof Error ? ensureError.message : "Mailbox-Setup fehlgeschlagen.",
      timedOut: false,
    };
  }

  const lockToken = randomUUID();

  const { data: locked, error: lockError } = await supabase.rpc("acquire_inbox_sync_lock", {
    p_mailbox_id: mailboxId,
    p_lock_token: lockToken,
    p_ttl_seconds: INBOX_SYNC_LOCK_TTL_SECONDS,
  });

  if (lockError) {
    return {
      processed: 0,
      stored: 0,
      skippedLocked: false,
      backfillComplete: Boolean(state.backfill_complete),
      cursorUid: Number(state.cursor_uid ?? 0),
      uidvalidity: state.uidvalidity == null ? null : Number(state.uidvalidity),
      error: "Sync-Lock fehlgeschlagen.",
      timedOut: false,
    };
  }

  if (!locked) {
    return {
      processed: 0,
      stored: 0,
      skippedLocked: true,
      backfillComplete: Boolean(state.backfill_complete),
      cursorUid: Number(state.cursor_uid ?? 0),
      uidvalidity: state.uidvalidity == null ? null : Number(state.uidvalidity),
      error: null,
      timedOut: false,
    };
  }

  let cursorUid = Number(state.cursor_uid ?? 0);
  let uidvalidity = state.uidvalidity == null ? null : Number(state.uidvalidity);
  let backfillComplete = Boolean(state.backfill_complete);
  let stored = 0;
  let processed = 0;
  let timedOut = false;
  let error: string | null = null;

  try {
    const cutoffAt = state.backfill_cutoff_at
      ? new Date(String(state.backfill_cutoff_at))
      : (() => {
          const cutoff = new Date();
          cutoff.setUTCDate(cutoff.getUTCDate() - INBOX_BACKFILL_DAYS);
          return cutoff;
        })();

    if (!canStartInboxFetch(started, timeBudgetMs)) {
      timedOut = true;
      return {
        processed: 0,
        stored: 0,
        skippedLocked: false,
        backfillComplete,
        cursorUid,
        uidvalidity,
        error: null,
        timedOut: true,
      };
    }

    const snapshotTimeout = Math.max(
      1_000,
      Math.min(INBOX_IMAP_OPERATION_TIMEOUT_MS, remainingBudgetMs(started, timeBudgetMs) - 500),
    );

    let snapshot = await fetchInboxFolderSnapshot(config, {
      since: !backfillComplete ? cutoffAt : undefined,
      cursorUid: backfillComplete ? cursorUid : 0,
      operationTimeoutMs: snapshotTimeout,
    });

    if (isUidvalidityReset(uidvalidity, snapshot.uidvalidity)) {
      logInboxSync("uidvalidity_reset", {
        previous: uidvalidity,
        next: snapshot.uidvalidity,
      });
      cursorUid = 0;
      backfillComplete = false;
      if (!canStartInboxFetch(started, timeBudgetMs)) {
        timedOut = true;
      } else {
        snapshot = await fetchInboxFolderSnapshot(config, {
          since: cutoffAt,
          cursorUid: 0,
          operationTimeoutMs: Math.max(
            1_000,
            Math.min(INBOX_IMAP_OPERATION_TIMEOUT_MS, remainingBudgetMs(started, timeBudgetMs) - 500),
          ),
        });
      }
    }
    uidvalidity = snapshot.uidvalidity;

    if (timedOut) {
      return {
        processed: 0,
        stored: 0,
        skippedLocked: false,
        backfillComplete,
        cursorUid,
        uidvalidity,
        error: null,
        timedOut: true,
      };
    }

    const candidateUids = filterUidsAfterCursor(snapshot.uids, cursorUid);
    const batchUids = candidateUids.slice(0, batchSize);

    if (batchUids.length === 0) {
      backfillComplete = true;
      const advanced = await supabase.rpc("advance_inbox_sync_cursor", {
        p_mailbox_id: mailboxId,
        p_lock_token: lockToken,
        p_uidvalidity: uidvalidity,
        p_cursor_uid: cursorUid,
        p_backfill_complete: true,
        p_success: true,
      });
      if (!advanced.data) {
        error = "Cursor-Fortschritt nach Lock-Verlust blockiert.";
      } else {
        // Spend remaining budget on attachment repair when inbox is caught up.
        await repairFailedAttachments({
          supabase,
          config,
          mailboxId,
          lockToken,
          uidvalidity,
          folder: snapshot.folder,
          started,
          timeBudgetMs,
        });
      }
      return {
        processed: 0,
        stored: 0,
        skippedLocked: false,
        backfillComplete: true,
        cursorUid,
        uidvalidity,
        error,
        timedOut: false,
      };
    }

    if (!canStartInboxFetch(started, timeBudgetMs)) {
      timedOut = true;
    } else {
      const fetchTimeout = Math.max(
        1_000,
        Math.min(INBOX_IMAP_OPERATION_TIMEOUT_MS, remainingBudgetMs(started, timeBudgetMs) - 500),
      );
      const { fetched, missingUids, emptySourceUids } = await fetchInboxMessagesByUid(
        config,
        batchUids,
        { operationTimeoutMs: fetchTimeout },
      );
      const storedUids: number[] = [];

      for (const item of fetched) {
        if (remainingBudgetMs(started, timeBudgetMs) < INBOX_FETCH_MIN_REMAINING_MS / 2) {
          timedOut = true;
          break;
        }

        processed += 1;
        const parsed = await parseInboxFetchItem(item);
        const result = await storeParsedMessage({
          supabase,
          mailboxId,
          lockToken,
          folder: snapshot.folder,
          uidvalidity,
          parsed,
        });

        if (result.lockLost) {
          error = result.error;
          break;
        }
        if (result.error && !result.messageId) {
          error = result.error;
          break;
        }

        storedUids.push(parsed.imapUid);
        stored += 1;
      }

      if (!error) {
        const nextCursor = nextCursorAfterBatch({
          previousCursor: cursorUid,
          attemptedUids: batchUids,
          storedUids,
          missingUids,
          emptySourceUids,
        });

        const noMore =
          filterUidsAfterCursor(snapshot.uids, nextCursor).length === 0 &&
          emptySourceUids.length === 0;
        if (noMore) {
          backfillComplete = true;
        }

        const { data: advanced } = await supabase.rpc("advance_inbox_sync_cursor", {
          p_mailbox_id: mailboxId,
          p_lock_token: lockToken,
          p_uidvalidity: uidvalidity,
          p_cursor_uid: nextCursor,
          p_backfill_complete: backfillComplete,
          p_success: true,
        });
        if (!advanced) {
          error = "Cursor-Fortschritt nach Lock-Verlust blockiert.";
        } else {
          cursorUid = nextCursor;
          if (!timedOut && canStartInboxFetch(started, timeBudgetMs)) {
            const repair = await repairFailedAttachments({
              supabase,
              config,
              mailboxId,
              lockToken,
              uidvalidity,
              folder: snapshot.folder,
              started,
              timeBudgetMs,
            });
            if (repair.lockLost) {
              error = "Sync-Lock verloren während Anhang-Reparatur.";
            }
            if (repair.timedOut) {
              timedOut = true;
            }
          }
        }
      }
    }
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : "Sync fehlgeschlagen.";
    if (message === "IMAP_TIMEOUT") {
      timedOut = true;
      error = null;
      logInboxSync("timeout", { code: "IMAP_TIMEOUT" });
    } else {
      error = message;
      logInboxSync("error", { code: "sync_failed" });
    }
    await supabase.rpc("advance_inbox_sync_cursor", {
      p_mailbox_id: mailboxId,
      p_lock_token: lockToken,
      p_uidvalidity: uidvalidity ?? 0,
      p_cursor_uid: cursorUid,
      p_success: false,
      p_last_error: error ?? "IMAP_TIMEOUT",
    });
  } finally {
    await supabase.rpc("release_inbox_sync_lock", {
      p_mailbox_id: mailboxId,
      p_lock_token: lockToken,
    });
    // Orphan GC does not require the sync lock; only deletes unreferenced expired leases.
    try {
      await cleanupOrphanStorageLeases({ supabase, started, timeBudgetMs });
    } catch {
      logInboxSync("orphan_cleanup_skipped", { code: "cleanup_error" });
    }
  }

  return {
    processed,
    stored,
    skippedLocked: false,
    backfillComplete,
    cursorUid,
    uidvalidity,
    error,
    timedOut,
  };
}
