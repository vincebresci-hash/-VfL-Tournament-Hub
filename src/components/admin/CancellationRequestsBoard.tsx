"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminCard,
  AdminEmpty,
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminMobileCardClass,
  adminStatusBadgeClass,
  adminTableHeaderBarClass,
  adminTableRowHoverClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { cn } from "@/lib/cn";
import {
  cancellationRequestStatusLabel,
  partitionCancellationRequests,
  type CancellationArchiveTab,
} from "@/lib/cancellations/cancellation-archive";
import { cancellationOnTimeLabel } from "@/lib/cancellations/deadline";
import { decideCancellationRequestAction } from "@/lib/cancellations/actions";
import { formatDateDe, formatDateTimeDe } from "@/lib/format";
import type { CancellationRequestListItem } from "@/types/cancellation";

type CancellationRequestsBoardProps = {
  requests: CancellationRequestListItem[];
};

const cancellationStatusClassName: Record<
  CancellationRequestListItem["status"],
  string
> = {
  pending: "bg-[#fff4d6] text-[#7a5b00]",
  confirmed: "bg-[#e6f4ea] text-[#1f6b3a]",
  rejected: "bg-[#fde8e8] text-[#9a2b2b]",
};

export function CancellationRequestsBoard({ requests }: CancellationRequestsBoardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<CancellationArchiveTab>("active");
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    decision: "confirmed" | "rejected";
  } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { active, archived } = useMemo(
    () => partitionCancellationRequests(requests),
    [requests],
  );
  const visible = tab === "active" ? active : archived;

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

  function renderActiveActions(request: CancellationRequestListItem) {
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
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "active", label: "Offene Absagen", count: active.length },
            { id: "archive", label: "Archiv", count: archived.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "h-9 rounded-lg px-3 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
              tab === item.id
                ? "bg-navy text-white"
                : "border border-line bg-white text-muted hover:border-navy/25 hover:text-ink",
            )}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      <AdminCard
        title={
          tab === "active"
            ? `Offene Absagen (${active.length})`
            : `Archiv (${archived.length})`
        }
      >
        {visible.length === 0 ? (
          <AdminEmpty>
            {tab === "active"
              ? "Keine offenen Absageanfragen."
              : "Keine archivierten Absageanfragen."}
          </AdminEmpty>
        ) : tab === "active" ? (
          <ActiveRequestsList
            requests={visible}
            renderActions={renderActiveActions}
          />
        ) : (
          <ArchiveRequestsList requests={visible} />
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

function ActiveRequestsList({
  requests,
  renderActions,
}: {
  requests: CancellationRequestListItem[];
  renderActions: (request: CancellationRequestListItem) => ReactNode;
}) {
  return (
    <>
      <div className="grid gap-2.5 lg:hidden">
        {requests.map((request) => (
          <article key={`mobile-${request.id}`} className={adminMobileCardClass}>
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                {request.clubName}
              </p>
              <p className="mt-0.5 truncate text-[13px] font-medium text-ink">
                {request.teamName}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
              <DetailField label="Turnier" className="col-span-2">
                <Link
                  href={`/admin/turniere/${request.tournamentSlug}`}
                  className="font-medium text-ink hover:text-brand-blue"
                >
                  <span className="block truncate">{request.tournamentName}</span>
                </Link>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDateDe(request.tournamentDate)}
                </p>
              </DetailField>
              <DetailField label="Ansprechpartner">
                <span className="text-muted">
                  {request.contactFirstName} {request.contactLastName}
                  <p className="mt-0.5 break-all">{request.contactEmail}</p>
                </span>
              </DetailField>
              <DetailField label="Anfrage">
                <span className="text-muted">
                  {formatDateTimeDe(request.requestedAt)}
                  <p className="mt-0.5 uppercase tracking-[0.08em]">
                    {requestChannelLabel(request.requestedByType)}
                  </p>
                </span>
              </DetailField>
              <DetailField label="Frist">
                <span className="text-muted">
                  {request.daysUntilTournament ?? "—"} Tage
                  <p className="mt-0.5">
                    {cancellationOnTimeLabel(request.isLateRequest)}
                  </p>
                </span>
              </DetailField>
              <DetailField label="Grund">
                <span className="break-words text-muted">
                  {request.reason?.trim() || "—"}
                </span>
              </DetailField>
            </dl>
            <div className="mt-3">{renderActions(request)}</div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line lg:block">
        <div className={adminTableHeaderBarClass}>
          <p>Offene Anfragen</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-3.5 py-2.5">Turnier</th>
                <th className="px-3.5 py-2.5">Mannschaft</th>
                <th className="px-3.5 py-2.5">Ansprechpartner</th>
                <th className="px-3.5 py-2.5">Anfrage</th>
                <th className="px-3.5 py-2.5">Frist</th>
                <th className="px-3.5 py-2.5">Grund</th>
                <th className="px-3.5 py-2.5">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={`desktop-${request.id}`} className={adminTableRowHoverClass}>
                  <td className="min-w-0 max-w-[180px] px-3.5 py-2.5 text-[14px]">
                    <Link
                      href={`/admin/turniere/${request.tournamentSlug}`}
                      className="font-medium text-ink hover:text-brand-blue"
                    >
                      <span className="block truncate">{request.tournamentName}</span>
                    </Link>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {formatDateDe(request.tournamentDate)}
                    </p>
                  </td>
                  <td className="min-w-0 max-w-[160px] px-3.5 py-2.5 text-[14px] text-ink">
                    <span className="block truncate">{request.clubName}</span>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {request.teamName}
                    </p>
                  </td>
                  <td className="min-w-0 max-w-[180px] px-3.5 py-2.5 text-[13px] text-muted">
                    {request.contactFirstName} {request.contactLastName}
                    <p className="mt-0.5 truncate">{request.contactEmail}</p>
                  </td>
                  <td className="px-3.5 py-2.5 text-[13px] text-muted">
                    {formatDateTimeDe(request.requestedAt)}
                    <p className="mt-0.5 uppercase tracking-[0.08em]">
                      {requestChannelLabel(request.requestedByType)}
                    </p>
                  </td>
                  <td className="px-3.5 py-2.5 text-[13px] text-muted">
                    {request.daysUntilTournament ?? "—"} Tage
                    <p className="mt-0.5">
                      {cancellationOnTimeLabel(request.isLateRequest)}
                    </p>
                  </td>
                  <td className="min-w-0 max-w-[200px] px-3.5 py-2.5 text-[13px] text-muted">
                    <span className="block break-words">
                      {request.reason?.trim() || "—"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">{renderActions(request)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ArchiveRequestsList({
  requests,
}: {
  requests: CancellationRequestListItem[];
}) {
  return (
    <>
      <div className="grid gap-2.5 lg:hidden">
        {requests.map((request) => (
          <article key={`mobile-archive-${request.id}`} className={adminMobileCardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                  {request.clubName}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-medium text-ink">
                  {request.teamName}
                </p>
              </div>
              <StatusBadge status={request.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
              <DetailField label="Turnier" className="col-span-2">
                <Link
                  href={`/admin/turniere/${request.tournamentSlug}`}
                  className="font-medium text-ink hover:text-brand-blue"
                >
                  <span className="block truncate">{request.tournamentName}</span>
                </Link>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDateDe(request.tournamentDate)}
                </p>
              </DetailField>
              <DetailField label="Anfrage">
                <span className="text-muted">
                  {formatDateTimeDe(request.requestedAt)}
                  <p className="mt-0.5 uppercase tracking-[0.08em]">
                    {requestChannelLabel(request.requestedByType)}
                  </p>
                </span>
              </DetailField>
              <DetailField label="Entscheidung">
                <span className="text-muted">
                  {request.decidedAt ? formatDateTimeDe(request.decidedAt) : "—"}
                  <p className="mt-0.5">
                    {cancellationOnTimeLabel(request.isLateRequest)}
                  </p>
                </span>
              </DetailField>
              <DetailField label="Grund" className="col-span-2">
                <span className="break-words text-muted">
                  {request.reason?.trim() || "—"}
                </span>
              </DetailField>
              {request.adminNote?.trim() ? (
                <DetailField label="Admin-Notiz" className="col-span-2">
                  <span className="break-words text-muted">
                    {request.adminNote.trim()}
                  </span>
                </DetailField>
              ) : null}
            </dl>
            <div className="mt-3">
              <Link
                href={`/admin/bewerbungen/${request.applicationId}`}
                className={adminTextLinkClass}
              >
                Bewerbung
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line lg:block">
        <div className={adminTableHeaderBarClass}>
          <p>Archivierte Anfragen</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-3.5 py-2.5">Turnier</th>
                <th className="px-3.5 py-2.5">Mannschaft</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Anfrage</th>
                <th className="px-3.5 py-2.5">Entscheidung</th>
                <th className="px-3.5 py-2.5">Grund</th>
                <th className="px-3.5 py-2.5">Admin-Notiz</th>
                <th className="px-3.5 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={`desktop-archive-${request.id}`}
                  className={adminTableRowHoverClass}
                >
                  <td className="min-w-0 max-w-[180px] px-3.5 py-2.5 text-[14px]">
                    <Link
                      href={`/admin/turniere/${request.tournamentSlug}`}
                      className="font-medium text-ink hover:text-brand-blue"
                    >
                      <span className="block truncate">{request.tournamentName}</span>
                    </Link>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {formatDateDe(request.tournamentDate)}
                    </p>
                  </td>
                  <td className="min-w-0 max-w-[160px] px-3.5 py-2.5 text-[14px] text-ink">
                    <span className="block truncate">{request.clubName}</span>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {request.teamName}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <StatusBadge status={request.status} />
                    <p className="mt-1 text-[11px] text-muted">
                      {requestChannelLabel(request.requestedByType)}
                      {" · "}
                      {cancellationOnTimeLabel(request.isLateRequest)}
                    </p>
                  </td>
                  <td className="px-3.5 py-2.5 text-[13px] text-muted">
                    {formatDateTimeDe(request.requestedAt)}
                  </td>
                  <td className="px-3.5 py-2.5 text-[13px] text-muted">
                    {request.decidedAt ? formatDateTimeDe(request.decidedAt) : "—"}
                  </td>
                  <td className="min-w-0 max-w-[200px] px-3.5 py-2.5 text-[13px] text-muted">
                    <span className="block break-words">
                      {request.reason?.trim() || "—"}
                    </span>
                  </td>
                  <td className="min-w-0 max-w-[200px] px-3.5 py-2.5 text-[13px] text-muted">
                    <span className="block break-words">
                      {request.adminNote?.trim() || "—"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={`/admin/bewerbungen/${request.applicationId}`}
                      className={adminTextLinkClass}
                    >
                      Bewerbung
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: CancellationRequestListItem["status"] }) {
  return (
    <span
      className={`shrink-0 ${adminStatusBadgeClass} ${cancellationStatusClassName[status]}`}
    >
      {cancellationRequestStatusLabel[status]}
    </span>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function requestChannelLabel(
  requestedByType: CancellationRequestListItem["requestedByType"],
) {
  return requestedByType === "club" ? "Vereinskonto" : "Extern";
}
