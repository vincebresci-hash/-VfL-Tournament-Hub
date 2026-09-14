"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
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
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/team-datenbank"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
      >
        ← Team-Datenbank
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <ParticipantClubLogo logoUrl={entry.logoUrl} clubName={entry.clubName} size="lg" />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
              {entry.teamName}
            </h1>
            <p className="mt-2 text-[15px] text-muted">{entry.clubName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                className="border border-line bg-white px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
              >
                {editing ? "Abbrechen" : "Bearbeiten"}
              </button>
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={archiving || deleting}
                className="border border-line bg-white px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-60"
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
                className="border border-[#d9b0b0] bg-[#fff5f5] px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase disabled:opacity-60"
              >
                Endgültig löschen
              </button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? <p className="mt-6 text-[14px] text-muted">{notice}</p> : null}
      {error ? (
        <p className="mt-6 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {confirmDelete && canManage ? (
        <div className="mt-6 border border-[#d9b0b0] bg-[#fff5f5] p-4">
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
              className="border border-[#9a2b2b] bg-[#9a2b2b] px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-white uppercase disabled:opacity-60"
            >
              {deleting ? "Lösche…" : "Ja, endgültig löschen"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="border border-line bg-white px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-60"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {editing && canManage ? (
        <div className="mt-8">
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
        <div className="mt-8 grid gap-5">
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
              <ParticipantClubLogo logoUrl={entry.logoUrl} clubName={entry.clubName} size="lg" />
            </AdminCard>
          ) : null}

          <AdminCard title="Stammdaten">
            <dl className="grid gap-4 sm:grid-cols-2">
              <AdminInfo label="Verein" value={entry.clubName} />
              <AdminInfo label="Team" value={entry.teamName} />
              <AdminInfo label="Altersklasse" value={displayValue(entry.ageGroup)} />
              <AdminInfo label="Ansprechpartner" value={displayValue(contactName)} />
              <AdminInfo label="E-Mail" value={displayValue(entry.contactEmail)} />
              <AdminInfo label="Telefon" value={displayValue(entry.contactPhone)} />
              <AdminInfo label="Website" value={displayValue(entry.website)} />
              <AdminInfo label="Liga" value={displayValue(entry.league)} />
              <AdminInfo label="Kategorie" value={displayValue(entry.internalCategory)} />
              <AdminInfo
                label="Spielstärke"
                value={displayValue(entry.internalStrength ?? entry.selfRatedStrength)}
              />
            </dl>
            {entry.internalNotes ? (
              <p className="mt-4 whitespace-pre-wrap text-[14px] leading-6 text-ink">
                {entry.internalNotes}
              </p>
            ) : null}
          </AdminCard>

          <AdminCard title="Systemdaten">
            <dl className="grid gap-4 sm:grid-cols-2">
              <AdminInfo
                label="Hub-Team"
                value={entry.isHubLinked ? "Ja" : "Nein (Archiv/CRM)"}
              />
              <AdminInfo label="Quelle" value={entry.source === "application" ? "Bewerbung" : "Manuell"} />
              <AdminInfo
                label="Erstellt"
                value={formatDateDe(entry.createdAt.slice(0, 10))}
              />
              <AdminInfo
                label="Aktualisiert"
                value={formatDateDe(entry.updatedAt.slice(0, 10))}
              />
              <AdminInfo
                label="Status"
                value={entry.archivedAt ? "Archiviert" : "Aktiv"}
              />
            </dl>
            {entry.teamId ? (
              <Link
                href={`/admin/teams/${entry.teamId}`}
                className="mt-5 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
              >
                Hub-Team ansehen →
              </Link>
            ) : null}
            {entry.sourceApplicationId ? (
              <Link
                href={`/admin/bewerbungen/${entry.sourceApplicationId}`}
                className="mt-5 ml-0 block text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue sm:ml-4 sm:inline-flex"
              >
                Ursprungsbewerbung →
              </Link>
            ) : null}
          </AdminCard>

          <AdminCard title="Turnierhistorie">
            {history.length === 0 ? (
              <p className="text-[14px] text-muted">Noch keine passenden Bewerbungen gefunden.</p>
            ) : (
              <div className="grid gap-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 border border-line px-4 py-3"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-ink">{item.tournamentName}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {item.tournamentDate
                          ? formatDateDe(item.tournamentDate)
                          : formatDateDe(item.createdAt.slice(0, 10))}
                        {item.ageGroup ? ` · ${item.ageGroup}` : ""}
                      </p>
                      {item.paymentStatus ? (
                        <p className="mt-1 text-[13px] text-muted">
                          Zahlung:{" "}
                          {paymentStatusLabel[item.paymentStatus as PaymentStatus] ??
                            item.paymentStatus}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <ApplicationStatusBadge status={item.status as never} />
                      <Link
                        href={`/admin/bewerbungen/${item.id}`}
                        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
                      >
                        Bewerbung
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      )}
    </div>
  );
}
