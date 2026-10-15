"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxReplyAttachmentPanel } from "@/components/admin/inbox/InboxReplyAttachmentPanel";
import { sendInboxReplyAction } from "@/lib/inbox/actions";
import {
  composerAttachmentsBlockSend,
  type ComposerAttachmentItem,
} from "@/lib/inbox/reply-attachment-composer";
import {
  clearReplyComposerDraft,
  readReplyComposerDraft,
  replyComposerDraftHasContent,
  writeReplyComposerDraft,
} from "@/lib/inbox/reply-composer-draft";
import { normalizeReplySubject } from "@/lib/inbox/reply-validation";
import { cn } from "@/lib/cn";
import type { InboxReplyListItem } from "@/lib/inbox/types";
import type { SendInboxReplyResult } from "@/lib/inbox/reply-send";

type ComposerPhase =
  | "editing"
  | "sending"
  | "sent"
  | "failed"
  | "uncertain"
  | "blocked";

export type InboxReplyComposerProps = {
  /** Bound to the open parent message — remount via key when selection changes. */
  parentMessageId: string;
  /** Authenticated actor id for sessionStorage draft scoping (never cross-user). */
  actorId: string;
  lockedToAddress: string;
  lockedToDisplay: string;
  originalSubject: string;
  /** When true, parent already has sending/uncertain — never start another send. */
  hasUnresolvedReply: boolean;
  onCancel: () => void;
  onOutcome: (result: SendInboxReplyResult, recorded: InboxReplyListItem | null) => void;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback keeps UUID shape for server validation.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function replyFromResult(
  result: SendInboxReplyResult,
  draft: { parentMessageId: string; toAddress: string; subject: string },
): InboxReplyListItem | null {
  if (!result.replyId || !result.status) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: result.replyId,
    parentMessageId: draft.parentMessageId,
    toAddress: draft.toAddress,
    subject: draft.subject,
    status: result.status,
    error: null,
    createdAt: now,
    sentAt: result.status === "sent" ? now : null,
    attachmentCount: 0,
  };
}

function sessionDraftStore(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const PHASE_BANNER: Record<
  Exclude<ComposerPhase, "editing" | "sending">,
  { tone: string; title: string; body: string }
> = {
  sent: {
    tone: "border-[#1f6b3a]/25 bg-[#eef7f0] text-[#1f6b3a]",
    title: "Antwort gesendet",
    body: "Die Nachricht wurde über IONOS SMTP übergeben.",
  },
  failed: {
    tone: "border-[#d9b0b0] bg-[#fff5f5] text-[#9a2b2b]",
    title: "Versand fehlgeschlagen",
    body: "Die Antwort wurde nicht zugestellt. Sie können den Text anpassen und erneut senden.",
  },
  uncertain: {
    tone: "border-[#c9a227]/40 bg-[#fff8e8] text-[#6b5300]",
    title: "Unklarer Versandstatus",
    body: "Es ist unklar, ob die E-Mail zugestellt wurde. Es wird nicht automatisch erneut gesendet. Bitte nicht noch einmal senden — bei Bedarf manuell prüfen.",
  },
  blocked: {
    tone: "border-[#c9a227]/40 bg-[#fff8e8] text-[#6b5300]",
    title: "Versand blockiert",
    body: "Für diese Nachricht läuft bereits ein Versand oder der Status ist unklar. Bitte nicht erneut senden.",
  },
};

export function InboxReplyComposer({
  parentMessageId,
  actorId,
  lockedToAddress,
  lockedToDisplay,
  originalSubject,
  hasUnresolvedReply,
  onCancel,
  onOutcome,
}: InboxReplyComposerProps) {
  const formId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const defaultSubject = normalizeReplySubject("", originalSubject);
  const [subject, setSubject] = useState(() => {
    const restored = readReplyComposerDraft(sessionDraftStore(), actorId, parentMessageId);
    if (restored) {
      return normalizeReplySubject(restored.subject, originalSubject);
    }
    return defaultSubject;
  });
  const [bodyText, setBodyText] = useState(() => {
    const restored = readReplyComposerDraft(sessionDraftStore(), actorId, parentMessageId);
    return restored?.bodyText ?? "";
  });
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [phase, setPhase] = useState<ComposerPhase>(() =>
    hasUnresolvedReply ? "blocked" : "editing",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    hasUnresolvedReply
      ? "Für diese Nachricht läuft bereits ein Versand oder der Status ist unklar."
      : null,
  );
  const [attachments, setAttachments] = useState<ComposerAttachmentItem[]>([]);
  const submitLockRef = useRef(false);
  const mountedRef = useRef(true);
  const attachmentSetKeyRef = useRef("");
  /** LOW: only refresh idempotency after a clear failed send when the set changes. */
  const refreshIdempotencyOnAttachChangeRef = useRef(false);
  const draftsEnabledRef = useRef(phase === "editing" || phase === "failed");

  const handleAttachmentsChange = useCallback((next: ComposerAttachmentItem[]) => {
    setAttachments(next);
    // Stable set fingerprint: uploadIds only (ignore localId churn during upload).
    const stableKey = next
      .map((item) => item.uploadId)
      .filter((id): id is string => Boolean(id))
      .sort()
      .join(",");
    if (
      refreshIdempotencyOnAttachChangeRef.current &&
      attachmentSetKeyRef.current !== stableKey
    ) {
      setIdempotencyKey(createIdempotencyKey());
      refreshIdempotencyOnAttachChangeRef.current = false;
    }
    attachmentSetKeyRef.current = stableKey;
  }, []);

  // Persist subject/body per actor+parent (never tokens/paths). Skip terminal phases.
  useEffect(() => {
    draftsEnabledRef.current = phase === "editing" || phase === "failed";
    if (!draftsEnabledRef.current) {
      return;
    }
    writeReplyComposerDraft(sessionDraftStore(), actorId, parentMessageId, {
      subject,
      bodyText,
    });
  }, [actorId, bodyText, parentMessageId, phase, subject]);

  const hasDiscardableWork =
    replyComposerDraftHasContent({
      subject,
      bodyText,
      defaultSubject,
    }) ||
    attachments.some(
      (item) =>
        item.status === "staged" ||
        item.status === "uploading" ||
        item.status === "authorizing" ||
        item.status === "finalizing" ||
        item.status === "queued",
    );

  function requestCancel() {
    if (hasDiscardableWork) {
      const confirmed = window.confirm(
        "Entwurf verwerfen? Ungespeicherter Text wird gelöscht. Noch nicht gesendete Anhänge bleiben ggf. nur serverseitig im Staging bis zum Ablauf.",
      );
      if (!confirmed) {
        return;
      }
    }
    clearReplyComposerDraft(sessionDraftStore(), actorId, parentMessageId);
    // H1: do not delete staged uploads on cancel — TTL/purge + explicit Entfernen.
    onCancel();
  }

  // Scroll the composer into the reading-pane scrollport, then focus the textarea.
  // preventScroll avoids a second jump of the window / outer page.
  useEffect(() => {
    mountedRef.current = true;
    const section = sectionRef.current;
    const body = bodyRef.current;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // nearest keeps motion inside the overflow-y pane instead of scrolling the document.
    section?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });

    const focusTimer = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }
      body?.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 50);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(focusTimer);
    };
  }, []);

  const attachmentSendGate = composerAttachmentsBlockSend(attachments);
  const attachmentsLocked =
    phase === "sending" ||
    phase === "sent" ||
    phase === "uncertain" ||
    phase === "blocked";
  const sendDisabled =
    phase === "sending" ||
    phase === "sent" ||
    phase === "uncertain" ||
    phase === "blocked" ||
    !bodyText.trim() ||
    !lockedToAddress.trim() ||
    attachmentSendGate.blocked;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Hard stop: never auto-retry or re-send after uncertain / blocked / sent.
    // sendDisabled already covers those phases plus empty body / in-flight lock /
    // pending-failed attachments / Phase 4c SMTP attachment gate.
    if (submitLockRef.current || sendDisabled) {
      return;
    }

    // Defense in depth: never pass attachment refs while allowAttachmentSend is false.
    // Text-only send remains available when the attachment list is empty.
    if (attachments.length > 0) {
      setStatusMessage(
        attachmentSendGate.reason ??
          "Anhangversand ist noch nicht freigeschaltet.",
      );
      return;
    }

    submitLockRef.current = true;
    setPhase("sending");
    setStatusMessage("Antwort wird gesendet…");

    const draft = {
      parentMessageId,
      toAddress: lockedToAddress,
      subject: normalizeReplySubject(subject, originalSubject),
      bodyText,
      idempotencyKey,
    };

    let result: SendInboxReplyResult;
    try {
      result = await sendInboxReplyAction({
        parentMessageId: draft.parentMessageId,
        toAddress: draft.toAddress,
        subject: draft.subject,
        bodyText: draft.bodyText,
        idempotencyKey: draft.idempotencyKey,
        // Phase 4c: attachment SMTP remains gated server-side (allowAttachmentSend: false).
        // Composer never forwards upload ids while the product gate is closed.
      });
    } catch {
      if (!mountedRef.current) {
        return;
      }
      submitLockRef.current = false;
      setPhase("failed");
      setStatusMessage("Versand konnte nicht gestartet werden. Bitte erneut versuchen.");
      // New key only after a clear client-side failure before server claim.
      setIdempotencyKey(createIdempotencyKey());
      return;
    }

    if (!mountedRef.current) {
      // Selection changed while send was in flight — do not apply UI to the wrong message.
      // Server-side claim/idempotency still owns delivery; never auto-retry here.
      return;
    }

    const recorded = replyFromResult(result, draft);
    onOutcome(result, recorded);

    if (result.ok && result.status === "sent") {
      clearReplyComposerDraft(sessionDraftStore(), actorId, parentMessageId);
      setPhase("sent");
      setStatusMessage(result.error ?? "Antwort wurde gesendet.");
      submitLockRef.current = true; // keep locked — no duplicate submit
      return;
    }

    if (
      result.status === "uncertain" ||
      result.errorCode === "smtp_uncertain" ||
      result.errorCode === "unresolved_reply_exists"
    ) {
      // Never mint a new idempotency key and never retry automatically.
      setPhase(result.errorCode === "unresolved_reply_exists" ? "blocked" : "uncertain");
      setStatusMessage(
        result.error ??
          "Unklarer Versandstatus — bitte nicht erneut senden.",
      );
      submitLockRef.current = true;
      return;
    }

    // Clear failure: allow a conscious retry with a fresh idempotency key only.
    setPhase("failed");
    setStatusMessage(result.error ?? "Versand fehlgeschlagen.");
    setIdempotencyKey(createIdempotencyKey());
    refreshIdempotencyOnAttachChangeRef.current = true;
    submitLockRef.current = false;
  }

  const banner =
    phase === "sent" || phase === "failed" || phase === "uncertain" || phase === "blocked"
      ? PHASE_BANNER[phase]
      : null;

  return (
    <section
      ref={sectionRef}
      className="shrink-0 rounded-lg border border-line/60 bg-gradient-to-b from-surface/50 to-white"
      aria-label="Antwort verfassen"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Antwort
          </p>
          <p className="mt-0.5 truncate text-[13px] text-ink/80">
            An den ursprünglichen Absender
          </p>
        </div>
        {phase === "sending" ? (
          <span className="rounded-md bg-navy/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
            Senden…
          </span>
        ) : null}
      </div>

      {banner ? (
        <div
          className={cn("border-b px-3 py-2.5 text-[13px] leading-5 sm:px-4", banner.tone)}
          role="status"
        >
          <p className="font-semibold">{banner.title}</p>
          <p className="mt-0.5 opacity-90">{statusMessage ?? banner.body}</p>
        </div>
      ) : statusMessage && phase === "sending" ? (
        <div
          className="border-b border-navy/10 bg-navy/[0.03] px-3 py-2 text-[13px] text-navy/80 sm:px-4"
          role="status"
        >
          {statusMessage}
        </div>
      ) : null}

      <form id={formId} className="space-y-3 px-3 py-3 sm:px-4 sm:py-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label
            htmlFor={`${formId}-to`}
            className="block text-[11px] font-semibold tracking-[0.06em] text-muted uppercase"
          >
            An
          </label>
          <input
            id={`${formId}-to`}
            type="text"
            readOnly
            value={lockedToDisplay}
            className="h-10 w-full cursor-not-allowed rounded-lg border border-line/70 bg-surface/70 px-3 text-[13px] text-ink/90"
            aria-readonly="true"
            title="Empfänger ist auf den ursprünglichen Absender festgelegt"
          />
          <p className="text-[11px] text-muted">
            Empfänger ist fest mit dem Absender der Originalnachricht verknüpft.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`${formId}-subject`}
            className="block text-[11px] font-semibold tracking-[0.06em] text-muted uppercase"
          >
            Betreff
          </label>
          <input
            id={`${formId}-subject`}
            type="text"
            value={subject}
            maxLength={200}
            disabled={phase === "sending" || phase === "sent" || phase === "uncertain" || phase === "blocked"}
            onChange={(event) => setSubject(event.target.value)}
            onBlur={() => setSubject((current) => normalizeReplySubject(current, originalSubject))}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`${formId}-body`}
            className="block text-[11px] font-semibold tracking-[0.06em] text-muted uppercase"
          >
            Nachricht
          </label>
          <textarea
            ref={bodyRef}
            id={`${formId}-body`}
            value={bodyText}
            rows={8}
            maxLength={20_000}
            disabled={phase === "sending" || phase === "sent" || phase === "uncertain" || phase === "blocked"}
            onChange={(event) => setBodyText(event.target.value)}
            placeholder="Ihre Antwort als Klartext…"
            className="min-h-[10rem] w-full resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] leading-6 text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60 sm:min-h-[12rem]"
          />
        </div>

        <InboxReplyAttachmentPanel
          parentMessageId={parentMessageId}
          disabled={attachmentsLocked}
          onAttachmentsChange={handleAttachmentsChange}
        />

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className={adminCompactSecondaryButtonClass}
            disabled={phase === "sending"}
            onClick={requestCancel}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className={adminCompactPrimaryButtonClass}
            disabled={sendDisabled}
            title={
              attachmentSendGate.blocked
                ? (attachmentSendGate.reason ?? undefined)
                : undefined
            }
            aria-describedby={
              attachmentSendGate.blocked && attachments.length > 0
                ? `${formId}-attach-gate`
                : undefined
            }
          >
            {phase === "sending" ? "Senden…" : "Senden"}
          </button>
        </div>
        {attachmentSendGate.blocked && attachments.length > 0 ? (
          <p id={`${formId}-attach-gate`} className="sr-only">
            {attachmentSendGate.reason}
          </p>
        ) : null}
      </form>
    </section>
  );
}
