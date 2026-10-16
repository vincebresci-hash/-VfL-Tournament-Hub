/**
 * Session draft helper tests (node:test). No React, no Supabase.
 * Run via: npx tsx --test src/lib/inbox/reply-composer-draft-tests.ts
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  buildReplyComposerDraftStorageKey,
  clearReplyComposerDraft,
  clearScopedReplyComposerDraftAfterSend,
  getReplyComposerDraftClearedEpoch,
  parseReplyComposerDraft,
  readReplyComposerDraft,
  replyComposerDraftHasContent,
  resetReplyComposerDraftClearRegistryForTests,
  serializeReplyComposerDraft,
  shouldClearReplyComposerDraftAfterSend,
  shouldResetComposerFieldsAfterScopedSendClear,
  shouldSuppressDraftPersistAfterSendClear,
  subscribeReplyComposerDraftCleared,
  writeReplyComposerDraft,
} from "@/lib/inbox/reply-composer-draft";

const ACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "11111111-1111-4111-8111-111111111111";
const MSG_2 = "22222222-2222-4222-8222-222222222222";

function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  } as Storage;
}

describe("reply composer draft persistence", () => {
  it("keys by actor + parent independently", () => {
    const keyA1 = buildReplyComposerDraftStorageKey(ACTOR_A, MSG_1);
    const keyA2 = buildReplyComposerDraftStorageKey(ACTOR_A, MSG_2);
    const keyB1 = buildReplyComposerDraftStorageKey(ACTOR_B, MSG_1);
    assert.ok(keyA1);
    assert.notEqual(keyA1, keyA2);
    assert.notEqual(keyA1, keyB1);
  });

  it("rejects invalid ids", () => {
    assert.equal(buildReplyComposerDraftStorageKey("nope", MSG_1), null);
    assert.equal(buildReplyComposerDraftStorageKey(ACTOR_A, "x"), null);
  });

  it("round-trips subject and body only", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Hallo",
    });
    const read = readReplyComposerDraft(store, ACTOR_A, MSG_1);
    assert.deepEqual(read, { subject: "Re: Turnier", bodyText: "Hallo" });
  });

  it("does not leak across actors or messages", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "A1",
      bodyText: "secret-a",
    });
    assert.equal(readReplyComposerDraft(store, ACTOR_B, MSG_1), null);
    assert.equal(readReplyComposerDraft(store, ACTOR_A, MSG_2), null);
  });

  it("clears after discard/send", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: X",
      bodyText: "y",
    });
    clearReplyComposerDraft(store, ACTOR_A, MSG_1);
    assert.equal(readReplyComposerDraft(store, ACTOR_A, MSG_1), null);
  });

  it("rejects payloads with privileged fields", () => {
    assert.equal(
      parseReplyComposerDraft(
        JSON.stringify({
          v: 1,
          subject: "x",
          bodyText: "y",
          token: "leak",
        }),
      ),
      null,
    );
    assert.equal(
      parseReplyComposerDraft(
        JSON.stringify({
          v: 1,
          subject: "x",
          bodyText: "y",
          path: "mb/msg/actor/upload/file.pdf",
        }),
      ),
      null,
    );
  });

  it("serialize never includes tokens/paths", () => {
    const raw = serializeReplyComposerDraft({ subject: "Re: A", bodyText: "B" });
    assert.equal(raw.includes("token"), false);
    assert.equal(raw.includes("path"), false);
    assert.equal(raw.includes("upload"), false);
  });

  it("hasContent ignores default subject-only", () => {
    assert.equal(
      replyComposerDraftHasContent({
        subject: "Re: Turnier",
        bodyText: "",
        defaultSubject: "Re: Turnier",
      }),
      false,
    );
    assert.equal(
      replyComposerDraftHasContent({
        subject: "Re: Turnier",
        bodyText: "Hi",
        defaultSubject: "Re: Turnier",
      }),
      true,
    );
  });
});

describe("M-A clear draft after send (race-safe)", () => {
  beforeEach(() => {
    resetReplyComposerDraftClearRegistryForTests();
  });

  it("only clears on successful sent status", () => {
    assert.equal(
      shouldClearReplyComposerDraftAfterSend({ sendOk: true, sendStatus: "sent" }),
      true,
    );
    assert.equal(
      shouldClearReplyComposerDraftAfterSend({ sendOk: false, sendStatus: "sent" }),
      false,
    );
    assert.equal(
      shouldClearReplyComposerDraftAfterSend({ sendOk: true, sendStatus: "failed" }),
      false,
    );
    assert.equal(
      shouldClearReplyComposerDraftAfterSend({ sendOk: true, sendStatus: "uncertain" }),
      false,
    );
  });

  it("clears scoped draft while leaving sibling message draft intact", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: A1",
      bodyText: "sending",
    });
    writeReplyComposerDraft(store, ACTOR_A, MSG_2, {
      subject: "Re: A2",
      bodyText: "keep",
    });

    const result = clearScopedReplyComposerDraftAfterSend({
      store,
      actorId: ACTOR_A,
      parentMessageId: MSG_1,
      sendOk: true,
      sendStatus: "sent",
    });
    assert.equal(result.cleared, true);
    assert.equal(readReplyComposerDraft(store, ACTOR_A, MSG_1), null);
    assert.deepEqual(readReplyComposerDraft(store, ACTOR_A, MSG_2), {
      subject: "Re: A2",
      bodyText: "keep",
    });
  });

  it("does not clear other actor drafts", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: A",
      bodyText: "a",
    });
    writeReplyComposerDraft(store, ACTOR_B, MSG_1, {
      subject: "Re: B",
      bodyText: "b",
    });
    clearScopedReplyComposerDraftAfterSend({
      store,
      actorId: ACTOR_A,
      parentMessageId: MSG_1,
      sendOk: true,
      sendStatus: "sent",
    });
    assert.equal(readReplyComposerDraft(store, ACTOR_A, MSG_1), null);
    assert.deepEqual(readReplyComposerDraft(store, ACTOR_B, MSG_1), {
      subject: "Re: B",
      bodyText: "b",
    });
  });

  it("no-ops safely when sessionStorage is unavailable", () => {
    const result = clearScopedReplyComposerDraftAfterSend({
      store: null,
      actorId: ACTOR_A,
      parentMessageId: MSG_1,
      sendOk: true,
      sendStatus: "sent",
    });
    assert.equal(result.cleared, true);
    assert.ok(result.key);
  });

  it("does not clear on failed send", () => {
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: A",
      bodyText: "keep-on-fail",
    });
    const result = clearScopedReplyComposerDraftAfterSend({
      store,
      actorId: ACTOR_A,
      parentMessageId: MSG_1,
      sendOk: false,
      sendStatus: "failed",
    });
    assert.equal(result.cleared, false);
    assert.deepEqual(readReplyComposerDraft(store, ACTOR_A, MSG_1), {
      subject: "Re: A",
      bodyText: "keep-on-fail",
    });
  });

  it("M4d-1 notifies listeners and bumps epoch on successful clear", () => {
    resetReplyComposerDraftClearRegistryForTests();
    const store = memoryStore();
    writeReplyComposerDraft(store, ACTOR_A, MSG_1, {
      subject: "Re: A",
      bodyText: "in-flight",
    });
    let notified = false;
    const unsubscribe = subscribeReplyComposerDraftCleared((event) => {
      if (event.actorId === ACTOR_A && event.parentMessageId === MSG_1) {
        notified = true;
        assert.equal(event.sentBodyText, "in-flight");
      }
    });
    const before = getReplyComposerDraftClearedEpoch(ACTOR_A, MSG_1);
    clearScopedReplyComposerDraftAfterSend({
      store,
      actorId: ACTOR_A,
      parentMessageId: MSG_1,
      sendOk: true,
      sendStatus: "sent",
      sentSubject: "Re: A",
      sentBodyText: "in-flight",
    });
    unsubscribe();
    assert.equal(notified, true);
    assert.equal(getReplyComposerDraftClearedEpoch(ACTOR_A, MSG_1), before + 1);
  });

  it("M4d-1 suppress persist only for matching sent fingerprint", () => {
    assert.equal(
      shouldResetComposerFieldsAfterScopedSendClear({
        currentSubject: "Re: A",
        currentBodyText: "same",
        sentSubject: "Re: A",
        sentBodyText: "same",
      }),
      true,
    );
    assert.equal(
      shouldResetComposerFieldsAfterScopedSendClear({
        currentSubject: "Re: A",
        currentBodyText: "edited after remount",
        sentSubject: "Re: A",
        sentBodyText: "same",
      }),
      false,
    );
    assert.equal(
      shouldSuppressDraftPersistAfterSendClear({
        seenClearEpoch: 0,
        currentClearEpoch: 1,
        currentSubject: "Re: A",
        currentBodyText: "same",
        sentSubject: "Re: A",
        sentBodyText: "same",
      }),
      true,
    );
  });
});
