"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { IconClose, IconMessage } from "@/components/ui/icons";
import { filterAllowedHelpChatLinks } from "@/lib/help/help-chat-links";
import {
  HELP_CHAT_GREETING,
  getStarterQuestions,
  type TurnierhubKnowledgeLink,
} from "@/lib/help/turnierhub-knowledge";
import type { HelpChatResponse } from "@/lib/help/help-chat";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  links?: TurnierhubKnowledgeLink[];
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ActionChips({ links }: { links: TurnierhubKnowledgeLink[] | undefined }) {
  const safeLinks = filterAllowedHelpChatLinks(links);
  if (safeLinks.length === 0) {
    return null;
  }

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {safeLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex min-h-8 items-center rounded-full border border-line/80 bg-white px-3 py-1 text-[11px] font-semibold text-ink shadow-sm transition-colors hover:border-brand-yellow hover:bg-brand-yellow/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="mr-auto flex max-w-[88%] items-center gap-1 rounded-2xl rounded-bl-md border border-line/60 bg-white px-3.5 py-2.5 shadow-sm" role="status" aria-label="Antwort wird geladen">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
    </div>
  );
}

export function TurnierhubHelpWidget() {
  const dialogTitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "greeting",
      role: "assistant",
      text: HELP_CHAT_GREETING,
    },
  ]);

  const starters = getStarterQuestions();
  const showStarters = messages.length === 1 && !loading;

  useEffect(() => {
    if (!open) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open, messages, loading]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || loading) {
      return;
    }

    setError(null);
    setLoading(true);
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "user", text: message },
    ]);
    setInput("");

    try {
      const response = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json()) as HelpChatResponse & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Die Anfrage konnte nicht verarbeitet werden.");
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: payload.message,
          links: payload.links,
        },
      ]);
    } catch {
      setError("Die Verbindung ist fehlgeschlagen. Bitte versucht es erneut.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:right-[max(1.5rem,env(safe-area-inset-right))]">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          className="pointer-events-auto mb-3 flex h-[min(75dvh,560px)] w-[min(calc(100vw-1.5rem),400px)] max-h-[75dvh] flex-col overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_20px_60px_rgba(7,11,18,0.22)] sm:h-[560px] sm:max-h-[560px] sm:w-[min(calc(100vw-2rem),420px)]"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-navy px-3.5 py-2.5 text-white sm:px-4 sm:py-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-brand-yellow/40"
              aria-hidden="true"
            >
              <IconMessage className="h-4 w-4 text-brand-yellow" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                id={dialogTitleId}
                className="truncate text-[13px] font-semibold leading-tight tracking-[0.02em] sm:text-[14px]"
              >
                Tournament Hub Hilfe
              </p>
              <p className="truncate text-[10px] leading-tight text-white/65 sm:text-[11px]">
                Antworten aus dem Hilfe-Wissen
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              aria-label="Hilfe schließen"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f4f6f9] px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex flex-col gap-2.5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[88%]"
                      : "mr-auto max-w-[92%]"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "rounded-2xl rounded-br-md bg-navy px-3.5 py-2.5 text-[13px] leading-[1.55] text-white shadow-sm ring-1 ring-brand-yellow/25 sm:text-[14px] sm:leading-6"
                        : "rounded-2xl rounded-bl-md border border-line/60 bg-white px-3.5 py-2.5 text-[13px] leading-[1.55] text-ink shadow-sm sm:text-[14px] sm:leading-6"
                    }
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    {message.role === "assistant" ? (
                      <ActionChips links={message.links} />
                    ) : null}
                  </div>
                </div>
              ))}

              {loading ? <TypingIndicator /> : null}

              {showStarters ? (
                <section
                  className="mt-1 rounded-xl border border-dashed border-line/70 bg-white/70 p-3 shadow-sm backdrop-blur-[1px]"
                  aria-label="Häufige Fragen"
                >
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                    Häufige Fragen
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {starters.map((starter) => (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => void sendMessage(starter.title)}
                        className="inline-flex min-h-9 max-w-full items-center rounded-full border border-line/80 bg-white px-3 py-1.5 text-left text-[11px] leading-snug font-medium text-ink shadow-sm transition-colors hover:border-brand-yellow hover:bg-brand-yellow/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow sm:text-[12px]"
                      >
                        <span className="line-clamp-2">{starter.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden="true" />
            </div>
          </div>

          {error ? (
            <p
              className="shrink-0 border-t border-line/60 bg-[#fff5f5] px-3.5 py-2 text-[12px] leading-5 text-[#9a2b2b] sm:px-4 sm:text-[13px]"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-line/60 bg-white px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-3.5 sm:py-3"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                maxLength={500}
                placeholder="Frage stellen …"
                aria-label="Frage an den Hilfe-Assistenten"
                className="h-11 min-w-0 flex-1 rounded-full border border-line/80 bg-[#f8f9fb] px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-brand-blue focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                disabled={loading}
                enterKeyHint="send"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={loading || input.trim().length === 0}
                className="inline-flex h-11 min-w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.04em] text-navy uppercase transition-all hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:cursor-not-allowed disabled:opacity-50"
                aria-busy={loading}
              >
                Senden
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto inline-flex h-12 min-h-11 items-center gap-2 rounded-full border border-navy bg-navy px-4 text-[13px] font-semibold text-white shadow-[0_12px_32px_rgba(7,11,18,0.28)] transition-transform duration-200 hover:scale-[1.03] hover:bg-[#0f2f63] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow active:scale-[0.98] sm:h-13 sm:px-5"
        aria-expanded={open}
        aria-controls={open ? dialogTitleId : undefined}
      >
        <IconMessage className="h-5 w-5 text-brand-yellow" />
        <span>Hilfe</span>
      </button>
    </div>
  );
}
