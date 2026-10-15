/**
 * Session draft helper tests (node:test). No React, no Supabase.
 * Run via: npx tsx --test src/lib/inbox/reply-composer-draft-tests.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplyComposerDraftStorageKey,
  clearReplyComposerDraft,
  parseReplyComposerDraft,
  readReplyComposerDraft,
  replyComposerDraftHasContent,
  serializeReplyComposerDraft,
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
