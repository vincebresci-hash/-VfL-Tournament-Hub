"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { IconClose, IconMessage } from "@/components/ui/icons";
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

function renderLinks(links: TurnierhubKnowledgeLink[] | undefined) {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center border border-line bg-white px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-surface"
        >
          {link.label}
        </Link>
      ))}
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

  useEffect(() => {
    if (!open) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          className="pointer-events-auto mb-3 flex w-[min(100vw-2rem,380px)] max-h-[70vh] flex-col overflow-hidden border border-line bg-white shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:max-h-[520px] sm:h-[520px]"
        >
          <div className="flex items-center justify-between border-b border-line bg-navy px-4 py-3 text-white">
            <div>
              <p id={dialogTitleId} className="text-[12px] font-semibold tracking-[0.08em] uppercase">
                Tournament Hub Hilfe
              </p>
              <p className="mt-0.5 text-[12px] text-white/70">Antworten aus dem Hilfe-Wissen</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center border border-white/20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              aria-label="Hilfe schließen"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-4">
            <div className="grid gap-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-8 border border-line bg-white px-3 py-2 text-[14px] leading-6 text-ink"
                      : "mr-4 border border-line bg-white px-3 py-2 text-[14px] leading-6 text-ink"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.role === "assistant" ? renderLinks(message.links) : null}
                </div>
              ))}

              {loading ? (
                <p className="mr-4 text-[13px] text-muted" role="status">
                  …
                </p>
              ) : null}

              {messages.length === 1 ? (
                <div className="mt-1 grid gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    Häufige Fragen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {starters.map((starter) => (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => void sendMessage(starter.title)}
                        className="border border-line bg-white px-2.5 py-1.5 text-left text-[12px] leading-5 text-ink hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                      >
                        {starter.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {error ? (
            <p className="border-t border-line bg-[#fff5f5] px-4 py-2 text-[13px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="border-t border-line bg-white px-3 py-3"
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
                className="h-10 min-w-0 flex-1 border border-line bg-white px-3 text-[14px] text-ink outline-none focus-visible:border-brand-blue"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || input.trim().length === 0}
                className="inline-flex h-10 shrink-0 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.06em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-60"
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
        className="pointer-events-auto inline-flex h-12 items-center gap-2 border border-navy bg-navy px-4 text-[13px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] hover:bg-[#0f2f63] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow sm:h-13 sm:px-5"
        aria-expanded={open}
        aria-controls={open ? dialogTitleId : undefined}
      >
        <IconMessage className="h-5 w-5 text-brand-yellow" />
        <span>Hilfe</span>
      </button>
    </div>
  );
}
