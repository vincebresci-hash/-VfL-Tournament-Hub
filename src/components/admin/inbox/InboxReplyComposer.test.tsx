/**
 * Phase 4d M-B — mocked React tests for InboxReplyComposer draft persistence.
 * NOT real browser / Supabase / SMTP E2E.
 *
 * Run: npm run test:inbox-attachment-react
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxReplyComposer } from "@/components/admin/inbox/InboxReplyComposer";
import {
  buildReplyComposerDraftStorageKey,
  readReplyComposerDraft,
  resetReplyComposerDraftClearRegistryForTests,
  writeReplyComposerDraft,
} from "@/lib/inbox/reply-composer-draft";

const ACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "11111111-1111-4111-8111-111111111111";
const MSG_2 = "22222222-2222-4222-8222-222222222222";

const sendMock = vi.fn();
const listMock = vi.fn();

vi.mock("@/lib/inbox/actions", () => ({
  sendInboxReplyAction: (...args: unknown[]) => sendMock(...args),
  listInboxReplyStagingAttachmentsAction: (...args: unknown[]) => listMock(...args),
  beginInboxReplyAttachmentUploadAction: vi.fn(),
  finalizeInboxReplyAttachmentUploadAction: vi.fn(),
  abandonUnfinishedInboxReplyAttachmentAction: vi.fn(),
  removeInboxReplyAttachmentAction: vi.fn(),
}));

vi.mock("@/components/admin/AdminPanel", () => ({
  adminCompactPrimaryButtonClass: "btn-primary",
  adminCompactSecondaryButtonClass: "btn-secondary",
}));

vi.mock("@/components/admin/inbox/InboxAttachmentIcon", () => ({
  InboxAttachmentIcon: () => <span data-testid="attach-icon" />,
}));

function renderComposer(
  overrides: Partial<{
    parentMessageId: string;
    actorId: string;
    originalSubject: string;
    hasUnresolvedReply: boolean;
    onCancel: () => void;
    onOutcome: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onCancel = overrides.onCancel ?? vi.fn();
  const onOutcome = overrides.onOutcome ?? vi.fn();
  const result = render(
    <InboxReplyComposer
      parentMessageId={overrides.parentMessageId ?? MSG_1}
      actorId={overrides.actorId ?? ACTOR_A}
      lockedToAddress="sender@example.com"
      lockedToDisplay="Sender <sender@example.com>"
      originalSubject={overrides.originalSubject ?? "Turnier"}
      hasUnresolvedReply={overrides.hasUnresolvedReply ?? false}
      onCancel={onCancel}
      onOutcome={onOutcome}
    />,
  );
  return { ...result, onCancel, onOutcome };
}

describe("InboxReplyComposer drafts (mocked — not E2E)", () => {
  beforeEach(() => {
    sendMock.mockReset();
    listMock.mockReset();
    listMock.mockResolvedValue({ ok: true, uploads: [], error: null, errorCode: null });
    sessionStorage.clear();
    resetReplyComposerDraftClearRegistryForTests();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    resetReplyComposerDraftClearRegistryForTests();
  });

  it("restores draft after reopening the composer", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Gespeicherter Entwurf",
    });

    renderComposer();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Gespeicherter Entwurf")).toBeTruthy();
    });
    const subject = screen.getByLabelText(/^Betreff$/i) as HTMLInputElement;
    expect(subject.value).toMatch(/Re:\s*Turnier/i);
  });

  it("clears draft after successful send and never forwards attachment ids", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Bitte senden",
    });
    sendMock.mockResolvedValue({
      ok: true,
      status: "sent",
      replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      error: null,
      errorCode: null,
      sendAttempted: true,
    });

    renderComposer();
    await waitFor(() => expect(screen.getByDisplayValue("Bitte senden")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Senden" }));

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeTruthy();
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).not.toHaveProperty("attachmentIds");
    expect(payload).not.toHaveProperty("uploadIds");
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining([
        "parentMessageId",
        "toAddress",
        "subject",
        "bodyText",
        "idempotencyKey",
      ]),
    );
    await waitFor(() => {
      expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toBeNull();
    });
  });

  it("clears draft after confirmed discard", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Verwerfen",
    });
    const { onCancel } = renderComposer();
    await waitFor(() => expect(screen.getByDisplayValue("Verwerfen")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toBeNull();
  });

  it("clears scoped draft when message switches during in-flight send", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "In flight",
    });
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_2, {
      subject: "Re: Andere",
      bodyText: "Other draft",
    });

    let resolveSend: ((value: unknown) => void) | null = null;
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    const { unmount } = renderComposer({ parentMessageId: MSG_1 });
    await waitFor(() => expect(screen.getByDisplayValue("In flight")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalled());

    // Simulate message switch (composer unmount) while SMTP send is in flight.
    unmount();

    await act(async () => {
      resolveSend?.({
        ok: true,
        status: "sent",
        replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        error: null,
        errorCode: null,
        sendAttempted: true,
      });
    });

    await waitFor(() => {
      expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toBeNull();
    });
    // Sibling message draft must remain.
    expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_2)).toEqual({
      subject: "Re: Andere",
      bodyText: "Other draft",
    });
  });

  it("does not leak drafts across actors or messages", () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: A1",
      bodyText: "secret-a",
    });
    writeReplyComposerDraft(sessionStorage, ACTOR_B, MSG_1, {
      subject: "Re: B1",
      bodyText: "secret-b",
    });

    const keyA1 = buildReplyComposerDraftStorageKey(ACTOR_A, MSG_1);
    const keyB1 = buildReplyComposerDraftStorageKey(ACTOR_B, MSG_1);
    const keyA2 = buildReplyComposerDraftStorageKey(ACTOR_A, MSG_2);
    expect(keyA1).not.toEqual(keyB1);
    expect(keyA1).not.toEqual(keyA2);

    renderComposer({ actorId: ACTOR_B, parentMessageId: MSG_1 });
    expect(screen.queryByDisplayValue("secret-a")).toBeNull();
    expect(screen.getByDisplayValue("secret-b")).toBeTruthy();
  });

  it("M4d-3 preserves draft after failed send", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Keep on fail",
    });
    sendMock.mockResolvedValue({
      ok: false,
      status: "failed",
      replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      error: "SMTP failed",
      errorCode: "smtp_failed",
      sendAttempted: true,
    });

    renderComposer();
    await waitFor(() => expect(screen.getByDisplayValue("Keep on fail")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toEqual({
        subject: "Re: Turnier",
        bodyText: "Keep on fail",
      });
    });
  });

  it("M4d-3 preserves draft after uncertain send", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Keep on uncertain",
    });
    sendMock.mockResolvedValue({
      ok: false,
      status: "uncertain",
      replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      error: "Unclear",
      errorCode: "smtp_uncertain",
      sendAttempted: true,
    });

    renderComposer();
    await waitFor(() => expect(screen.getByDisplayValue("Keep on uncertain")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toEqual({
        subject: "Re: Turnier",
        bodyText: "Keep on uncertain",
      });
    });
  });

  it("M4d-1 remount during in-flight send does not resurrect cleared draft", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "In flight",
    });

    let resolveSend: ((value: unknown) => void) | null = null;
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    const first = renderComposer({ parentMessageId: MSG_1 });
    await waitFor(() => expect(screen.getByDisplayValue("In flight")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalled());

    // Unmount (message switch) then remount same message while send is still in flight.
    first.unmount();
    const second = renderComposer({ parentMessageId: MSG_1 });
    await waitFor(() => expect(screen.getByDisplayValue("In flight")).toBeTruthy());

    await act(async () => {
      resolveSend?.({
        ok: true,
        status: "sent",
        replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        error: null,
        errorCode: null,
        sendAttempted: true,
      });
    });

    await waitFor(() => {
      expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toBeNull();
    });

    // Remounted composer must not re-persist the sent fingerprint.
    await act(async () => {
      await Promise.resolve();
    });
    expect(readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1)).toBeNull();
    // UI reset to empty body (matching fingerprint cleared).
    await waitFor(() => {
      const body = screen.getByLabelText(/^Nachricht$/i) as HTMLTextAreaElement;
      expect(body.value).toBe("");
    });
    second.unmount();
  });

  it("M4d-1 remount with newer edits keeps user text after send clear", async () => {
    writeReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1, {
      subject: "Re: Turnier",
      bodyText: "Original send",
    });

    let resolveSend: ((value: unknown) => void) | null = null;
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    const first = renderComposer({ parentMessageId: MSG_1 });
    await waitFor(() => expect(screen.getByDisplayValue("Original send")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    first.unmount();

    const second = renderComposer({ parentMessageId: MSG_1 });
    await waitFor(() => expect(screen.getByDisplayValue("Original send")).toBeTruthy());
    const body = screen.getByLabelText(/^Nachricht$/i) as HTMLTextAreaElement;
    await userEvent.clear(body);
    await userEvent.type(body, "Newer edit after remount");

    await act(async () => {
      resolveSend?.({
        ok: true,
        status: "sent",
        replyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        error: null,
        errorCode: null,
        sendAttempted: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Newer edit after remount")).toBeTruthy();
    });
    // New edits may be persisted; must not be wiped to empty / original.
    await waitFor(() => {
      const stored = readReplyComposerDraft(sessionStorage, ACTOR_A, MSG_1);
      expect(stored?.bodyText).toBe("Newer edit after remount");
    });
    second.unmount();
  });

  it("keeps attachment SMTP send gate closed (no attachment ids forwarded)", async () => {
    // Seed a staged attachment via the panel's list restore path.
    listMock.mockResolvedValue({
      ok: true,
      uploads: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          parentMessageId: MSG_1,
          filename: "plan.pdf",
          contentType: "application/pdf",
          sizeBytes: 100,
          status: "staging",
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
      ],
      error: null,
      errorCode: null,
    });

    renderComposer();
    await waitFor(() => expect(screen.getByText("plan.pdf")).toBeTruthy());

    const sendBtn = screen.getByRole("button", { name: "Senden" }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    // Panel status + composer sr-only gate both surface the same copy.
    expect(
      screen.getAllByText(/Anhangversand ist noch nicht freigeschaltet/i).length,
    ).toBeGreaterThanOrEqual(1);
    const sendArgs = sendMock.mock.calls[0];
    expect(sendArgs).toBeUndefined();
  });
});
