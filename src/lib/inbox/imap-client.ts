import "server-only";

import {
  INBOX_IMAP_CONNECTION_TIMEOUT_MS,
  INBOX_IMAP_GREETING_TIMEOUT_MS,
  INBOX_IMAP_OPERATION_TIMEOUT_MS,
  INBOX_IMAP_SOCKET_TIMEOUT_MS,
  INBOX_IMAP_TEARDOWN_TIMEOUT_MS,
  type InboxImapConfig,
} from "@/lib/inbox/config";
import type { InboxImapFetchItem, InboxImapFolderSnapshot } from "@/lib/inbox/types";

type ImapFlowClient = {
  connect: () => Promise<void>;
  logout: () => Promise<void>;
  close?: () => void;
  mailbox: { uidValidity?: bigint | number; uidNext?: bigint | number } | false | null;
  getMailboxLock: (
    path: string,
    options?: { readOnly?: boolean },
  ) => Promise<{ release: () => void }>;
  search: (
    query: Record<string, unknown>,
    options?: { uid?: boolean },
  ) => Promise<number[] | false | null>;
  fetch: (
    range: number[] | string,
    query: Record<string, unknown>,
    options?: { uid?: boolean },
  ) => AsyncIterable<{
    uid?: number;
    flags?: Set<string> | string[];
    internalDate?: Date | string | null;
    source?: Buffer | Uint8Array | string;
  }>;
};

function createImapClient(config: InboxImapConfig): Promise<ImapFlowClient> {
  return import("imapflow").then(({ ImapFlow }) => {
    return new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      logger: false,
      connectionTimeout: INBOX_IMAP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: INBOX_IMAP_GREETING_TIMEOUT_MS,
      socketTimeout: INBOX_IMAP_SOCKET_TIMEOUT_MS,
    }) as unknown as ImapFlowClient;
  });
}

async function forceCloseClient(client: ImapFlowClient) {
  try {
    client.close?.();
  } catch {
    // ignore
  }
}

/**
 * Bounded teardown: never await an unbounded logout/close sequence.
 * close() rejects in-flight commands; logout is raced with a short timeout.
 */
export async function teardownImapClient(
  client: ImapFlowClient,
  teardownTimeoutMs = INBOX_IMAP_TEARDOWN_TIMEOUT_MS,
): Promise<void> {
  await forceCloseClient(client);
  await Promise.race([
    (async () => {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    })(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, teardownTimeoutMs);
    }),
  ]);
  await forceCloseClient(client);
}

async function withBoundedImap<T>(
  config: InboxImapConfig,
  operationTimeoutMs: number,
  run: (client: ImapFlowClient) => Promise<T>,
): Promise<T> {
  const client = await createImapClient(config);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void forceCloseClient(client);
      reject(new Error("IMAP_TIMEOUT"));
    }, operationTimeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        await client.connect();
        return run(client);
      })(),
      timeoutPromise,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    // Cleanup is hard-capped; must not consume Hobby remaining budget unbounded.
    await teardownImapClient(client, INBOX_IMAP_TEARDOWN_TIMEOUT_MS);
  }
}

/**
 * IMAP read helpers. imapflow fetches message bodies via BODY.PEEK (never marks \Seen).
 * Mailboxes are opened read-only. Never mutates mailbox flags.
 */
export async function fetchInboxFolderSnapshot(
  config: InboxImapConfig,
  options: { since?: Date; cursorUid: number; operationTimeoutMs?: number },
): Promise<InboxImapFolderSnapshot> {
  return withBoundedImap(
    config,
    options.operationTimeoutMs ?? INBOX_IMAP_OPERATION_TIMEOUT_MS,
    async (client) => {
      const lock = await client.getMailboxLock(config.folder, { readOnly: true });
      try {
        const mailbox = client.mailbox;
        if (!mailbox) {
          throw new Error("Mailbox konnte nicht geöffnet werden.");
        }

        const uidvalidity = Number(mailbox.uidValidity);
        const uidnext = Number(mailbox.uidNext ?? 1);
        let uids: number[] = [];

        if (options.since && options.cursorUid <= 0) {
          const found = await client.search({ since: options.since }, { uid: true });
          uids = (found || []).map((uid) => Number(uid)).filter((uid) => Number.isFinite(uid));
        } else if (options.cursorUid > 0) {
          const range = `${options.cursorUid + 1}:*`;
          const found = await client.search({ uid: range }, { uid: true });
          uids = (found || [])
            .map((uid) => Number(uid))
            .filter((uid) => Number.isFinite(uid) && uid > options.cursorUid);
        } else {
          const found = await client.search({ all: true }, { uid: true });
          uids = (found || []).map((uid) => Number(uid)).filter((uid) => Number.isFinite(uid));
        }

        uids.sort((a, b) => a - b);

        return {
          folder: config.folder,
          uidvalidity,
          uidnext,
          uids,
        };
      } finally {
        lock.release();
      }
    },
  );
}

export async function fetchInboxMessagesByUid(
  config: InboxImapConfig,
  uids: number[],
  options?: { operationTimeoutMs?: number },
): Promise<{
  fetched: InboxImapFetchItem[];
  missingUids: number[];
  emptySourceUids: number[];
}> {
  if (uids.length === 0) {
    return { fetched: [], missingUids: [], emptySourceUids: [] };
  }

  return withBoundedImap(
    config,
    options?.operationTimeoutMs ?? INBOX_IMAP_OPERATION_TIMEOUT_MS,
    async (client) => {
      const fetched: InboxImapFetchItem[] = [];
      const seen = new Set<number>();
      const emptySourceUids: number[] = [];

      const lock = await client.getMailboxLock(config.folder, { readOnly: true });
      try {
        // source fetch uses BODY.PEEK in imapflow — does not set \Seen on IONOS.
        for await (const message of client.fetch(
          uids,
          { uid: true, flags: true, internalDate: true, source: true },
          { uid: true },
        )) {
          const uid = Number(message.uid);
          if (!Number.isFinite(uid)) {
            continue;
          }
          seen.add(uid);
          if (!message.source) {
            emptySourceUids.push(uid);
            continue;
          }
          const source = Buffer.isBuffer(message.source)
            ? message.source
            : Buffer.from(message.source);
          if (source.length === 0) {
            emptySourceUids.push(uid);
            continue;
          }
          fetched.push({
            uid,
            flags: [...(message.flags ?? [])].map(String),
            internalDate: message.internalDate ? new Date(message.internalDate) : null,
            source,
          });
        }
      } finally {
        lock.release();
      }

      const missingUids = uids.filter((uid) => !seen.has(uid));
      return { fetched, missingUids, emptySourceUids };
    },
  );
}
