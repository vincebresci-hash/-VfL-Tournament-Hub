"use client";

import { useMemo, useState } from "react";
import { AdminEmpty, AdminNotice } from "@/components/admin/AdminPanel";
import { formatDateTimeDe } from "@/lib/format";
import type { EmailLogStatus, EmailLogView } from "@/types/admin";

type EmailLogsBoardProps = {
  logs: EmailLogView[];
  ready: boolean;
};

type StatusFilter = "all" | EmailLogStatus;

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "sent", label: "Gesendet" },
  { id: "failed", label: "Fehlgeschlagen" },
  { id: "pending", label: "Ausstehend" },
];

const statusLabel: Record<EmailLogStatus, string> = {
  pending: "Ausstehend",
  sent: "Gesendet",
  failed: "Fehlgeschlagen",
};

const statusClassName: Record<EmailLogStatus, string> = {
  pending: "bg-[#eceef2] text-ink",
  sent: "bg-navy text-white/86",
  failed: "bg-[#f6d9d9] text-[#9a2b2b]",
};

export function EmailLogsBoard({ logs, ready }: EmailLogsBoardProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tournamentId, setTournamentId] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");

  const tournamentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of logs) {
      if (log.tournamentId && log.tournamentName) {
        map.set(log.tournamentId, log.tournamentName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [logs]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return logs.filter((log) => {
      const statusMatch = status === "all" || log.status === status;
      const tournamentMatch =
        tournamentId === "all" || log.tournamentId === tournamentId;
      const queryMatch =
        search.length === 0 || log.recipient.toLowerCase().includes(search);

      return statusMatch && tournamentMatch && queryMatch;
    });
  }, [logs, status, tournamentId, query]);

  if (!ready) {
    return (
      <AdminNotice>
        Bitte zuerst die neue SQL-Migration (email_logs) im Supabase SQL Editor
        ausführen, damit das Versandprotokoll angezeigt werden kann.
      </AdminNotice>
    );
  }

  return (
    <div>
      <p className="mt-6 max-w-2xl text-[14px] leading-6 text-muted">
        Protokoll aller automatisch ausgelösten E-Mails. Es werden ausschließlich
        Metadaten gespeichert – niemals Provider-Schlüssel oder Zugangsdaten.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Status
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatus(filter.id)}
                className={
                  status === filter.id
                    ? "inline-flex h-9 items-center bg-navy px-3 text-[11px] font-semibold tracking-[0.08em] text-white/90 uppercase"
                    : "inline-flex h-9 items-center border border-line px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="email-log-tournament"
            className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase"
          >
            Turnier
          </label>
          <select
            id="email-log-tournament"
            value={tournamentId}
            onChange={(event) => setTournamentId(event.target.value)}
            className="mt-2 h-10 w-full border border-line bg-white px-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            <option value="all">Alle Turniere</option>
            {tournamentOptions.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="email-log-search"
            className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase"
          >
            Empfänger-Suche
          </label>
          <input
            id="email-log-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="E-Mail-Adresse suchen"
            className="mt-2 h-10 w-full border border-line bg-white px-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          />
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>
            Es wurden noch keine automatischen E-Mails versendet.
          </AdminEmpty>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>Keine Einträge für die aktuelle Auswahl.</AdminEmpty>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface">
                <Th>Zeitpunkt</Th>
                <Th>Empfänger</Th>
                <Th>Verein</Th>
                <Th>Turnier</Th>
                <Th>Vorlage</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-line last:border-b-0">
                  <Td>{formatDateTimeDe(log.createdAt)}</Td>
                  <Td>{log.recipient}</Td>
                  <Td>{log.clubName ?? "—"}</Td>
                  <Td>{log.tournamentName ?? "—"}</Td>
                  <Td>{log.templateName ?? "—"}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${statusClassName[log.status]}`}
                    >
                      {statusLabel[log.status]}
                    </span>
                    {log.status === "failed" && log.errorMessage ? (
                      <span className="mt-1 block max-w-[220px] text-[11px] leading-5 text-muted">
                        {log.errorMessage}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-[13px] text-ink">{children}</td>;
}
