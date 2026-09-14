"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import {
  AdminCard,
  AdminInfo,
  adminCardShellClass,
  adminDestructiveButtonClass,
  adminSecondaryButtonClass,
  adminStatusBadgeClass,
  adminTextLinkClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { TeamDirectoryForm } from "@/components/admin/TeamDirectoryForm";
import { TeamDirectoryLogoEditor } from "@/components/admin/TeamDirectoryLogoEditor";
import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { formatDateDe } from "@/lib/format";
import { paymentStatusLabel } from "@/lib/payments/labels";
import {
  deleteTeamDirectoryEntryAction,
  setTeamDirectoryArchivedAction,
} from "@/lib/team-directory/actions";
import type {
  TeamDirectoryApplicationHistory,
  TeamDirectoryEntry,
} from "@/types/team-directory";
import type { PaymentStatus } from "@/types/payment";

type TeamDirectoryDetailViewProps = {
  entry: TeamDirectoryEntry;
  history: TeamDirectoryApplicationHistory[];
  canManage: boolean;
};

export function TeamDirectoryDetailView({
  entry,
  history,
  canManage,
}: TeamDirectoryDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleArchiveToggle() {
    setArchiving(true);
    setError(null);
    setNotice(null);

    const result = await setTeamDirectoryArchivedAction(entry.id, !entry.archivedAt);
    setArchiving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(entry.archivedAt ? "Team reaktiviert." : "Team archiviert.");
    router.refresh();
  }

  async function handleHardDelete() {
    setDeleting(true);
    setError(null);
    setNotice(null);

    const result = await deleteTeamDirectoryEntryAction(entry.id);
    setDeleting(false);

    if (result.error) {
      setError(result.error);
      setConfirmDelete(false);
      return;
    }

    router.push("/admin/team-datenbank");
    router.refresh();
  }

  const contactName = [entry.contactFirstName, entry.contactLastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/team-datenbank"
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Team-Datenbank
      </Link>

      {/* Identity hero */}
      <div
        className={`mt-4 ${adminCardShellClass} border-l-4 border-l-brand-yellow p-4 sm:p-5`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
              <ParticipantClubLogo
                logoUrl={entry.logoUrl}
                clubName={entry.clubName}
                size="lg"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
                {entry.teamName}
              </h1>
              <p className="mt-1 truncate text-[15px] text-muted">{entry.clubName}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {entry.ageGroup ? (
                  <span className={`${adminStatusBadgeClass} bg-navy text-white`}>
                    {entry.ageGroup}
                  </span>
                ) : null}
                <span
                  className={`${adminStatusBadgeClass} ${
                    entry.archivedAt
                      ? "bg-[#f2e8e8] text-[#8a3b3b]"
                      : "bg-[#e8f5ee] text-[#1f6b3f]"
                  }`}
                >
                  {entry.archivedAt ? "Archiviert" : "Aktiv"}
                </span>
                {entry.internalCategory ? (
                  <span className={`${adminStatusBadgeClass} bg-surface text-ink`}>
                    {entry.internalCategory}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                className={`${adminSecondaryButtonClass} h-9 px-3 text-[11px]`}
              >
                {editing ? "Abbrechen" : "Bearbeiten"}
              </button>
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={archiving || deleting}
                className={`${adminSecondaryButtonClass} h-9 px-3 text-[11px]`}
              >
                {entry.archivedAt ? "Reaktivieren" : "Archivieren"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setError(null);
                  setNotice(null);
                }}
                disabled={archiving || deleting}
                className={`${adminDestructiveButtonClass} h-9 px-3 text-[11px]`}
              >
                Endgültig löschen
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {notice ? <p className="mt-4 text-[14px] text-muted">{notice}</p> : null}
      {error ? (
        <p className="mt-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {confirmDelete && canManage ? (
        <div className="mt-5 rounded-xl border border-[#d9b0b0] bg-[#fff5f5] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[14px] font-medium text-[#9a2b2b]">Eintrag endgültig löschen?</p>
          <p className="mt-2 text-[13px] leading-6 text-ink">
            Dieser Vorgang löscht nur den Eintrag aus der Team-Datenbank. Bewerbungen,
            Turnierteilnahmen, Spiele und andere Turnierdaten bleiben erhalten.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={handleHardDelete}
              className="rounded-lg border border-[#9a2b2b] bg-[#9a2b2b] px-4 py-2 text-[12px] font-semibold tracking-[0.06em] text-white uppercase disabled:opacity-60"
            >
              {deleting ? "Lösche…" : "Ja, endgültig löschen"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className={`${adminSecondaryButtonClass} h-9 px-3 text-[11px]`}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {editing && canManage ? (
        <div className="mt-5">
          <TeamDirectoryForm
            initialValues={{
              id: entry.id,
              clubName: entry.clubName,
              teamName: entry.teamName,
              ageGroup: entry.ageGroup,
              contactFirstName: entry.contactFirstName,
              contactLastName: entry.contactLastName,
              contactRole: entry.contactRole,
              contactEmail: entry.contactEmail,
              contactPhone: entry.contactPhone,
              website: entry.website,
              league: entry.league,
              birthYear: entry.birthYear,
              division: entry.division,
              selfRatedStrength: entry.selfRatedStrength,
              internalCategory: entry.internalCategory,
              internalStrength: entry.internalStrength,
              internalNotes: entry.internalNotes,
              sourceApplicationId: entry.sourceApplicationId,
              clubId: entry.clubId,
              teamId: entry.teamId,
              source: entry.source,
            }}
            submitLabel="Änderungen speichern"
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              setNotice("Team-Datensatz aktualisiert.");
              router.refresh();
            }}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {/* Main 2-column layout */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
            <div className="grid gap-4">
              <AdminCard title="Stammdaten">
                <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <AdminInfo label="Verein" value={entry.clubName} />
                  <AdminInfo label="Team" value={entry.teamName} />
                  <AdminInfo label="Altersklasse" value={displayValue(entry.ageGroup)} />
                  <AdminInfo label="Ansprechpartner" value={displayValue(contactName)} />
                  <AdminInfo label="E-Mail" value={displayValue(entry.contactEmail)} />
                  <AdminInfo label="Telefon" value={displayValue(entry.contactPhone)} />
                  <AdminInfo label="Website" value={displayValue(entry.website)} />
                  <AdminInfo label="Liga" value={displayValue(entry.league)} />
                  <AdminInfo
                    label="Kategorie"
                    value={displayValue(entry.internalCategory)}
                  />
                  <AdminInfo
                    label="Spielstärke"
                    value={displayValue(
                      entry.internalStrength ?? entry.selfRatedStrength,
                    )}
                  />
                </dl>
                {entry.internalNotes ? (
                  <p className="mt-4 rounded-lg bg-surface/60 px-3 py-2.5 whitespace-pre-wrap text-[13px] leading-6 text-ink">
                    {entry.internalNotes}
                  </p>
                ) : null}
              </AdminCard>

              {canManage ? (
                <TeamDirectoryLogoEditor
                  entryId={entry.id}
                  clubName={entry.clubName}
                  logoUrl={entry.logoUrl}
                  onDone={(result) => {
                    if (result.error) {
                      setError(result.error);
                      setNotice(null);
                      return;
                    }
                    setError(null);
                    setNotice(result.notice);
                    router.refresh();
                  }}
                />
              ) : entry.logoUrl ? (
                <AdminCard title="Team-Logo">
                  <ParticipantClubLogo
                    logoUrl={entry.logoUrl}
                    clubName={entry.clubName}
                    size="lg"
                  />
                </AdminCard>
              ) : null}
            </div>

            <AdminCard title="Systemdaten">
              <dl className="grid gap-3.5">
                <AdminInfo
                  label="Status"
                  value={entry.archivedAt ? "Archiviert" : "Aktiv"}
                />
                <AdminInfo
                  label="Quelle"
                  value={entry.source === "application" ? "Bewerbung" : "Manuell"}
                />
                <AdminInfo
                  label="Hub-Team"
                  value={entry.isHubLinked ? "Ja" : "Nein (Archiv/CRM)"}
                />
                <AdminInfo
                  label="Erstellt"
                  value={formatDateDe(entry.createdAt.slice(0, 10))}
                />
                <AdminInfo
                  label="Aktualisiert"
                  value={formatDateDe(entry.updatedAt.slice(0, 10))}
                />
              </dl>
              <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-3">
                {entry.teamId ? (
                  <Link
                    href={`/admin/teams/${entry.teamId}`}
                    className={adminTextLinkClass}
                  >
                    Hub-Team ansehen →
                  </Link>
                ) : null}
                {entry.sourceApplicationId ? (
                  <Link
                    href={`/admin/bewerbungen/${entry.sourceApplicationId}`}
                    className={adminTextLinkClass}
                  >
                    Ursprungsbewerbung →
                  </Link>
                ) : null}
              </div>
            </AdminCard>
          </div>

          <AdminCard title="Turnierhistorie">
            {history.length === 0 ? (
              <p className="text-[14px] text-muted">
                Noch keine passenden Bewerbungen gefunden.
              </p>
            ) : (
              <>
                {/* Mobile / compact list */}
                <div className="grid gap-2 lg:hidden">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-line bg-surface/30 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-[14px] font-medium text-ink">
                          {item.tournamentName}
                        </p>
                        <ApplicationStatusBadge status={item.status as never} />
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {item.tournamentDate
                          ? formatDateDe(item.tournamentDate)
                          : formatDateDe(item.createdAt.slice(0, 10))}
                        {item.ageGroup ? ` · ${item.ageGroup}` : ""}
                        {item.paymentStatus
                          ? ` · ${
                              paymentStatusLabel[item.paymentStatus as PaymentStatus] ??
                              item.paymentStatus
                            }`
                          : ""}
                      </p>
                      <Link
                        href={`/admin/bewerbungen/${item.id}`}
                        className={`${adminTextLinkClass} mt-2`}
                      >
                        Bewerbung
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-lg border border-line lg:block">
                  <table className="w-full table-fixed text-left text-[13px]">
                    <thead className="border-b border-line bg-surface/80 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                      <tr>
                        <th className="w-[34%] px-3.5 py-2.5">Turnier</th>
                        <th className="w-[14%] px-3.5 py-2.5">Datum</th>
                        <th className="w-[12%] px-3.5 py-2.5">Altersklasse</th>
                        <th className="w-[16%] px-3.5 py-2.5">Zahlung</th>
                        <th className="w-[14%] px-3.5 py-2.5">Status</th>
                        <th className="w-[10%] px-3.5 py-2.5">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-line/70 last:border-b-0 transition-colors hover:bg-surface/60"
                        >
                          <td className="px-3.5 py-2.5 font-medium text-ink">
                            <span className="block truncate">{item.tournamentName}</span>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                            {item.tournamentDate
                              ? formatDateDe(item.tournamentDate)
                              : formatDateDe(item.createdAt.slice(0, 10))}
                          </td>
                          <td className="px-3.5 py-2.5 text-muted">
                            {displayValue(item.ageGroup)}
                          </td>
                          <td className="px-3.5 py-2.5 text-muted">
                            {item.paymentStatus
                              ? (paymentStatusLabel[
                                  item.paymentStatus as PaymentStatus
                                ] ?? item.paymentStatus)
                              : "—"}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <ApplicationStatusBadge status={item.status as never} />
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Link
                              href={`/admin/bewerbungen/${item.id}`}
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
              </>
            )}
          </AdminCard>
        </div>
      )}
    </div>
  );
}
