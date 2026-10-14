"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { sendInboxReplyAction } from "@/lib/inbox/actions";
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
  const [subject, setSubject] = useState(() =>
    normalizeReplySubject("", originalSubject),
  );
  const [bodyText, setBodyText] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [phase, setPhase] = useState<ComposerPhase>(() =>
    hasUnresolvedReply ? "blocked" : "editing",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    hasUnresolvedReply
      ? "Für diese Nachricht läuft bereits ein Versand oder der Status ist unklar."
      : null,
  );
  const submitLockRef = useRef(false);
  const mountedRef = useRef(true);

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

  const sendDisabled =
    phase === "sending" ||
    phase === "sent" ||
    phase === "uncertain" ||
    phase === "blocked" ||
    !bodyText.trim() ||
    !lockedToAddress.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Hard stop: never auto-retry or re-send after uncertain / blocked / sent.
    // sendDisabled already covers those phases plus empty body / in-flight lock.
    if (submitLockRef.current || sendDisabled) {
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
        // Phase 4: omit attachments entirely (server rejects any supplied value).
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

        {/* Phase 4 hook: attachment UI reserved, intentionally disabled. */}
        <div className="rounded-md border border-dashed border-line/70 bg-surface/30 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                Anhänge
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                Noch nicht verfügbar — Vorbereitung für eine spätere Version.
              </p>
            </div>
            <button
              type="button"
              disabled
              className={cn(adminCompactSecondaryButtonClass, "shrink-0 opacity-50")}
              title="Anhänge folgen in Phase 4"
            >
              Anhang hinzufügen
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className={adminCompactSecondaryButtonClass}
            disabled={phase === "sending"}
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className={adminCompactPrimaryButtonClass}
            disabled={sendDisabled}
          >
            {phase === "sending" ? "Senden…" : "Senden"}
          </button>
        </div>
      </form>
    </section>
  );
}
