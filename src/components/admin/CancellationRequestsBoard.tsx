"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminCard,
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { cancellationOnTimeLabel } from "@/lib/cancellations/deadline";
import { decideCancellationRequestAction } from "@/lib/cancellations/actions";
import { formatDateDe, formatDateTimeDe } from "@/lib/format";
import type { CancellationRequestListItem } from "@/types/cancellation";

type CancellationRequestsBoardProps = {
  requests: CancellationRequestListItem[];
};

export function CancellationRequestsBoard({ requests }: CancellationRequestsBoardProps) {
  const router = useRouter();
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    decision: "confirmed" | "rejected";
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pending = requests.filter((request) => request.status === "pending");

  async function handleDecision() {
    if (!pendingDecision) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await decideCancellationRequestAction({
      requestId: pendingDecision.id,
      decision: pendingDecision.decision,
      adminNote,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPendingDecision(null);
    setAdminNote("");
    router.refresh();
  }

  function renderActions(request: CancellationRequestListItem) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() =>
            setPendingDecision({ id: request.id, decision: "confirmed" })
          }
          className={`${adminCompactPrimaryButtonClass} w-full sm:w-auto`}
        >
          Absage bestätigen
        </button>
        <button
          type="button"
          onClick={() =>
            setPendingDecision({ id: request.id, decision: "rejected" })
          }
          className={`${adminCompactSecondaryButtonClass} w-full sm:w-auto`}
        >
          Absage ablehnen
        </button>
        <Link
          href={`/admin/bewerbungen/${request.applicationId}`}
          className={adminTextLinkClass}
        >
          Bewerbung
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <AdminCard title={`Offene Absageanfragen (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-[14px] text-muted">Keine offenen Absageanfragen.</p>
        ) : (
          <>
            <div className="grid gap-3 lg:hidden">
              {pending.map((request) => (
                <article
                  key={`mobile-${request.id}`}
                  className="border border-line bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold tracking-wide text-ink uppercase">
                      {request.clubName}
                    </p>
                    <p className="mt-1 truncate text-[13px] text-muted">{request.teamName}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
                    <div className="min-w-0 col-span-2">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Turnier
                      </dt>
                      <dd className="mt-1">
                        <Link
                          href={`/admin/turniere/${request.tournamentSlug}`}
                          className="font-medium text-ink hover:text-brand-blue"
                        >
                          <span className="block truncate">{request.tournamentName}</span>
                        </Link>
                        <p className="mt-1 text-[12px]">{formatDateDe(request.tournamentDate)}</p>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Ansprechpartner
                      </dt>
                      <dd className="mt-1">
                        {request.contactFirstName} {request.contactLastName}
                        <p className="mt-1 truncate">{request.contactEmail}</p>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Anfrage
                      </dt>
                      <dd className="mt-1">
                        {formatDateTimeDe(request.requestedAt)}
                        <p className="mt-1 uppercase tracking-[0.08em]">
                          {request.requestedByType === "club" ? "Vereinskonto" : "Extern"}
                        </p>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Frist
                      </dt>
                      <dd className="mt-1">
                        {request.daysUntilTournament ?? "—"} Tage
                        <p className="mt-1">{cancellationOnTimeLabel(request.isLateRequest)}</p>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                        Grund
                      </dt>
                      <dd className="mt-1 break-words">{request.reason?.trim() || "—"}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">{renderActions(request)}</div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left">
                <thead className="border-b border-line text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                  <tr>
                    <th className="px-3 py-3">Turnier</th>
                    <th className="px-3 py-3">Mannschaft</th>
                    <th className="px-3 py-3">Ansprechpartner</th>
                    <th className="px-3 py-3">Anfrage</th>
                    <th className="px-3 py-3">Frist</th>
                    <th className="px-3 py-3">Grund</th>
                    <th className="px-3 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((request) => (
                    <tr
                      key={`desktop-${request.id}`}
                      className="border-b border-line last:border-0"
                    >
                      <td className="max-w-[180px] px-3 py-4 text-[14px]">
                        <Link
                          href={`/admin/turniere/${request.tournamentSlug}`}
                          className="font-medium text-ink hover:text-brand-blue"
                        >
                          <span className="block truncate">{request.tournamentName}</span>
                        </Link>
                        <p className="mt-1 text-[12px] text-muted">
                          {formatDateDe(request.tournamentDate)}
                        </p>
                      </td>
                      <td className="max-w-[160px] px-3 py-4 text-[14px] text-ink">
                        <span className="block truncate">{request.clubName}</span>
                        <p className="mt-1 truncate text-[12px] text-muted">
                          {request.teamName}
                        </p>
                      </td>
                      <td className="max-w-[180px] px-3 py-4 text-[13px] text-muted">
                        {request.contactFirstName} {request.contactLastName}
                        <p className="mt-1 truncate">{request.contactEmail}</p>
                      </td>
                      <td className="px-3 py-4 text-[13px] text-muted">
                        {formatDateTimeDe(request.requestedAt)}
                        <p className="mt-1 uppercase tracking-[0.08em]">
                          {request.requestedByType === "club" ? "Vereinskonto" : "Extern"}
                        </p>
                      </td>
                      <td className="px-3 py-4 text-[13px] text-muted">
                        {request.daysUntilTournament ?? "—"} Tage
                        <p className="mt-1">
                          {cancellationOnTimeLabel(request.isLateRequest)}
                        </p>
                      </td>
                      <td className="max-w-[200px] px-3 py-4 text-[13px] text-muted">
                        <span className="block break-words">
                          {request.reason?.trim() || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-4">{renderActions(request)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>

      <ConfirmModal
        open={pendingDecision !== null}
        title={
          pendingDecision?.decision === "confirmed"
            ? "Absageanfrage bestätigen?"
            : "Absageanfrage ablehnen?"
        }
        confirmLabel={submitting ? "Wird gespeichert…" : "Entscheidung speichern"}
        onCancel={() => {
          if (!submitting) {
            setPendingDecision(null);
            setAdminNote("");
            setError(null);
          }
        }}
        onConfirm={() => {
          void handleDecision();
        }}
      >
        <div className="grid gap-3 text-left">
          <label
            htmlFor="admin-note"
            className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase"
          >
            Interne Notiz (optional)
          </label>
          <textarea
            id="admin-note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            className="min-h-24 w-full border border-line px-3 py-2 text-[14px]"
          />
          {error ? (
            <p className="text-[13px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ConfirmModal>
    </div>
  );
}
