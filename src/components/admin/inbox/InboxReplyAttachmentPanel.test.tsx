/**
 * Phase 4c mocked React component tests (vitest + Testing Library + jsdom).
 *
 * These are NOT real browser / Supabase / SMTP E2E tests.
 * Server actions and signed PUT are mocked; no network, no credentials.
 *
 * Run: npm run test:inbox-attachment-react
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxReplyAttachmentPanel } from "@/components/admin/inbox/InboxReplyAttachmentPanel";
import { composerAttachmentsBlockSend } from "@/lib/inbox/reply-attachment-composer";

const PARENT_A = "11111111-1111-4111-8111-111111111111";
const PARENT_B = "22222222-2222-4222-8222-222222222222";
const UPLOAD_ID = "44444444-4444-4444-8444-444444444444";

const beginMock = vi.fn();
const finalizeMock = vi.fn();
const abandonMock = vi.fn();
const listMock = vi.fn();
const removeMock = vi.fn();
const putMock = vi.fn();

vi.mock("@/lib/inbox/actions", () => ({
  beginInboxReplyAttachmentUploadAction: (...args: unknown[]) => beginMock(...args),
  finalizeInboxReplyAttachmentUploadAction: (...args: unknown[]) => finalizeMock(...args),
  abandonUnfinishedInboxReplyAttachmentAction: (...args: unknown[]) => abandonMock(...args),
  listInboxReplyStagingAttachmentsAction: (...args: unknown[]) => listMock(...args),
  removeInboxReplyAttachmentAction: (...args: unknown[]) => removeMock(...args),
}));

vi.mock("@/lib/inbox/reply-attachment-direct-upload", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/inbox/reply-attachment-direct-upload")
  >("@/lib/inbox/reply-attachment-direct-upload");
  return {
    ...actual,
    uploadInboxReplyAttachmentToSignedUrl: (...args: unknown[]) => putMock(...args),
  };
});

vi.mock("@/components/admin/AdminPanel", () => ({
  adminCompactSecondaryButtonClass: "btn-secondary",
}));

vi.mock("@/components/admin/inbox/InboxAttachmentIcon", () => ({
  InboxAttachmentIcon: () => <span data-testid="attach-icon" />,
}));

function makePdfFile(name = "plan.pdf", size = 1200): File {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x25;
  bytes[1] = 0x50;
  bytes[2] = 0x44;
  bytes[3] = 0x46;
  return new File([bytes], name, { type: "application/pdf" });
}

function authPayload(uploadId = UPLOAD_ID) {
  return {
    uploadId,
    bucket: "inbox-reply-attachments",
    path: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${PARENT_A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/${uploadId}/plan.pdf`,
    token: "test-token-not-for-persistence",
    signedUrl: "https://example.test/upload",
    contentType: "application/pdf",
    sizeBytes: 1200,
    finalizeDeadlineMs: Date.now() + 60_000,
  };
}

async function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await userEvent.upload(input, file);
}

describe("InboxReplyAttachmentPanel (mocked component tests — not E2E)", () => {
  beforeEach(() => {
    beginMock.mockReset();
    finalizeMock.mockReset();
    abandonMock.mockReset();
    listMock.mockReset();
    removeMock.mockReset();
    putMock.mockReset();

    listMock.mockResolvedValue({ ok: true, uploads: [], error: null, errorCode: null });
    abandonMock.mockResolvedValue({
      ok: true,
      abandoned: true,
      error: null,
      errorCode: null,
    });
    removeMock.mockResolvedValue({ ok: true, error: null, errorCode: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("mocked begin → PUT → finalize reaches staged", async () => {
    beginMock.mockResolvedValue({
      ok: true,
      authorization: authPayload(),
      error: null,
      errorCode: null,
    });
    putMock.mockResolvedValue({ ok: true });
    finalizeMock.mockResolvedValue({
      ok: true,
      upload: {
        id: UPLOAD_ID,
        parentMessageId: PARENT_A,
        filename: "plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 1200,
        status: "staging",
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      },
      error: null,
      errorCode: null,
    });

    const onChange = vi.fn();
    render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={onChange}
      />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledWith(PARENT_A));
    await pickFile(makePdfFile());

    await waitFor(() => {
      expect(beginMock).toHaveBeenCalled();
      expect(putMock).toHaveBeenCalled();
      expect(finalizeMock).toHaveBeenCalledWith(UPLOAD_ID);
    });

    await waitFor(() => {
      expect(screen.getByText("plan.pdf")).toBeTruthy();
      expect(screen.getByText("Bereit")).toBeTruthy();
      const last = onChange.mock.calls.at(-1)?.[0] as Array<{ status: string }>;
      expect(last?.some((row) => row.status === "staged")).toBe(true);
    });
  });

  it("unmount during PUT abandons unfinished only", async () => {
    let resolvePut: ((value: { ok: true }) => void) | null = null;
    beginMock.mockResolvedValue({
      ok: true,
      authorization: authPayload(),
      error: null,
      errorCode: null,
    });
    putMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    const { unmount } = render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={() => {}}
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await pickFile(makePdfFile());
    await waitFor(() => expect(putMock).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(abandonMock).toHaveBeenCalledWith(UPLOAD_ID));

    // Completing PUT after unmount must not finalize a stale generation.
    await act(async () => {
      resolvePut?.({ ok: true });
    });
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("message switch after finalize does not delete staged", async () => {
    beginMock.mockResolvedValue({
      ok: true,
      authorization: authPayload(),
      error: null,
      errorCode: null,
    });
    putMock.mockResolvedValue({ ok: true });
    finalizeMock.mockResolvedValue({
      ok: true,
      upload: {
        id: UPLOAD_ID,
        parentMessageId: PARENT_A,
        filename: "plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 1200,
        status: "staging",
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      },
      error: null,
      errorCode: null,
    });

    const { unmount } = render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={() => {}}
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(PARENT_A));
    await pickFile(makePdfFile());
    await waitFor(() => expect(finalizeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("plan.pdf")).toBeTruthy());

    abandonMock.mockClear();
    // Simulate parent remount / message switch via unmount (key change).
    unmount();
    // Staged must NOT be abandoned on unmount.
    expect(abandonMock).not.toHaveBeenCalled();

    listMock.mockResolvedValue({
      ok: true,
      uploads: [
        {
          id: UPLOAD_ID,
          parentMessageId: PARENT_B,
          filename: "other.pdf",
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
    // Fresh mount for B after unmount (message switch).
    render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_B}
        disabled={false}
        onAttachmentsChange={() => {}}
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(PARENT_B));
    await waitFor(() => expect(screen.getByText("other.pdf")).toBeTruthy());
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("remove during finalize reconciles when abandon reports not_unfinished", async () => {
    let resolveFinalize: ((value: unknown) => void) | null = null;
    beginMock.mockResolvedValue({
      ok: true,
      authorization: authPayload(),
      error: null,
      errorCode: null,
    });
    putMock.mockResolvedValue({ ok: true });
    finalizeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFinalize = resolve;
        }),
    );
    abandonMock.mockResolvedValue({
      ok: true,
      abandoned: false,
      error: null,
      errorCode: "not_unfinished",
    });
    removeMock.mockResolvedValue({ ok: true, error: null, errorCode: null });

    render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={() => {}}
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await pickFile(makePdfFile());
    await waitFor(() => expect(finalizeMock).toHaveBeenCalled());

    const removeBtn = await screen.findByRole("button", { name: "Entfernen" });
    await userEvent.click(removeBtn);

    await waitFor(() => expect(abandonMock).toHaveBeenCalledWith(UPLOAD_ID));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(UPLOAD_ID));

    await act(async () => {
      resolveFinalize?.({
        ok: true,
        upload: {
          id: UPLOAD_ID,
          parentMessageId: PARENT_A,
          filename: "plan.pdf",
          contentType: "application/pdf",
          sizeBytes: 1200,
          status: "staging",
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
        error: null,
        errorCode: null,
      });
    });

    // Explicit staging remove succeeded — row gone from UI.
    await waitFor(() => {
      expect(screen.queryByText("plan.pdf")).toBeNull();
    });
  });

  it("remove during finalize keeps staged visible when staging remove fails", async () => {
    let resolveFinalize: ((value: unknown) => void) | null = null;
    beginMock.mockResolvedValue({
      ok: true,
      authorization: authPayload(),
      error: null,
      errorCode: null,
    });
    putMock.mockResolvedValue({ ok: true });
    finalizeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFinalize = resolve;
        }),
    );
    abandonMock.mockResolvedValue({
      ok: true,
      abandoned: false,
      error: null,
      errorCode: "not_unfinished",
    });
    removeMock.mockResolvedValue({
      ok: false,
      error: "Anhang kann nicht entfernt werden.",
      errorCode: "remove_failed",
    });

    render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={() => {}}
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await pickFile(makePdfFile());
    await waitFor(() => expect(finalizeMock).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(removeMock).toHaveBeenCalled());

    await act(async () => {
      resolveFinalize?.({
        ok: true,
        upload: {
          id: UPLOAD_ID,
          parentMessageId: PARENT_A,
          filename: "plan.pdf",
          contentType: "application/pdf",
          sizeBytes: 1200,
          status: "staging",
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
        error: null,
        errorCode: null,
      });
    });

    // M2: must not silently hide the staged upload.
    await waitFor(() => {
      expect(screen.getByText("plan.pdf")).toBeTruthy();
    });
  });

  it("restores staged attachments from list on mount", async () => {
    listMock.mockResolvedValue({
      ok: true,
      uploads: [
        {
          id: UPLOAD_ID,
          parentMessageId: PARENT_A,
          filename: "restored.pdf",
          contentType: "application/pdf",
          sizeBytes: 500,
          status: "staging",
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
      ],
      error: null,
      errorCode: null,
    });

    const onChange = vi.fn();
    render(
      <InboxReplyAttachmentPanel
        parentMessageId={PARENT_A}
        disabled={false}
        onAttachmentsChange={onChange}
      />,
    );

    await waitFor(() => expect(screen.getByText("restored.pdf")).toBeTruthy());
    const last = onChange.mock.calls.at(-1)?.[0] as Array<{ status: string; filename: string }>;
    expect(last?.[0]?.status).toBe("staged");
    expect(last?.[0]?.filename).toBe("restored.pdf");
    expect(beginMock).not.toHaveBeenCalled();
  });

  it("send gate blocks while attachments exist (product gate)", () => {
    const gate = composerAttachmentsBlockSend([
      {
        localId: "1",
        parentMessageId: PARENT_A,
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "staged",
        uploadId: UPLOAD_ID,
        error: null,
        errorCode: null,
      },
    ]);
    expect(gate.blocked).toBe(true);
    expect(gate.reason ?? "").toMatch(/nicht freigeschaltet/i);
  });
});
