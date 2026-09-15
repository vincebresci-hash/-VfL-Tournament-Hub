"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PaymentStatusPanel } from "@/components/admin/PaymentStatusPanel";
import { TeamDirectorySavePanel } from "@/components/admin/TeamDirectorySavePanel";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { InternalRating } from "@/components/admin/InternalRating";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import {
  AdminCard,
  AdminInfo,
  AdminNotice,
  adminCardShellClass,
  adminDestructiveButtonClass,
  adminIdentityHeroClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSectionTitleClass,
  adminTextLinkClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import {
  getClubTypeLabel,
  getStatusDecisionCopy,
  getTournamentAdminSummary,
} from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import type { ApplicationStatus } from "@/types/application";
import type { Tournament } from "@/types/tournament";

type ApplicationDetailProps = {
  applicationId: string;
  tournament: Tournament;
  canManageTeamDirectory?: boolean;
};

const decisions: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "accepted", label: "Annehmen" },
  { status: "waiting-list", label: "Warteliste" },
  { status: "rejected", label: "Absagen" },
  { status: "under-review", label: "In Prüfung" },
];

export function ApplicationDetail({
  applicationId,
  tournament,
  canManageTeamDirectory = false,
}: ApplicationDetailProps) {
  const router = useRouter();
  const {
    getApplication,
    updateStatus,
    updateInternalRating,
    archiveApplication,
    restoreApplication,
    deleteApplication,
    applications,
    externalTeams,
  } = useAdminData();
  const application = getApplication(applicationId);
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(
    null,
  );
  const [confirmAction, setConfirmAction] = useState<
    "archive" | "restore" | "delete" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!application) {
    return null;
  }

  const summary = getTournamentAdminSummary(
    tournament,
    applications,
    externalTeams.filter((team) => team.tournamentId === tournament.id),
  );
  const canAccept =
    !summary.isFull || application.applicationStatus === "accepted";

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/bewerbungen"
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Bewerbungen
      </Link>

      <div className={`mt-4 ${adminIdentityHeroClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
              {application.clubName}
            </h1>
            <p className="mt-1 truncate text-[15px] text-muted">
              {application.teamName}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {tournament.name} · {formatDateDe(tournament.date)}
            </p>
          </div>
          <ApplicationStatusBadge status={application.applicationStatus} />
        </div>
      </div>

      {notice ? <AdminNotice>{notice}</AdminNotice> : null}
      {statusError ? (
        <p
          className={`mt-5 ${adminCardShellClass} px-4 py-3.5 text-[14px] text-[#9a2b2b]`}
          role="alert"
        >
          {statusError}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-4">
          <AdminCard title="Verein">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <AdminInfo label="Vereinsname" value={application.clubName} />
              <AdminInfo label="Ort" value={application.clubCity} />
              {application.website ? (
                <AdminInfo label="Website" value={application.website} />
              ) : null}
              {application.clubType ? (
                <AdminInfo
                  label="Vereinstyp"
                  value={getClubTypeLabel(application.clubType)}
                />
              ) : null}
            </dl>
          </AdminCard>

          <AdminCard title="Mannschaft">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <AdminInfo label="Mannschaftsname" value={application.teamName} />
              <AdminInfo label="Altersklasse" value={application.ageGroup} />
              <AdminInfo label="Jahrgang" value={String(application.birthYear)} />
              <AdminInfo label="Liga" value={displayValue(application.league)} />
              <AdminInfo
                label="Staffel"
                value={application.division ?? "Keine Angabe"}
              />
              <AdminInfo
                label="Selbsteinschätzung Spielstärke"
                value={`${application.selfRatedStrength}/5`}
              />
              <AdminInfo
                label="Beschreibung"
                value={application.teamDescription ?? "Keine Angabe"}
              />
            </dl>
          </AdminCard>

          <AdminCard title="Ansprechpartner">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <AdminInfo label="Vorname" value={application.contactFirstName} />
              <AdminInfo label="Nachname" value={application.contactLastName} />
              <AdminInfo label="Funktion" value={application.contactRole} />
              <AdminInfo label="E-Mail" value={application.contactEmail} />
              <AdminInfo
                label="Telefon"
                value={displayValue(application.contactPhone)}
              />
              {application.alternativePhone ? (
                <AdminInfo
                  label="Alternative Telefonnummer"
                  value={application.alternativePhone}
                />
              ) : null}
            </dl>
          </AdminCard>

          <AdminCard title="Turnier">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <AdminInfo label="Turniername" value={tournament.name} />
              <AdminInfo label="Datum" value={formatDateDe(tournament.date)} />
              <AdminInfo label="Ort" value={tournament.location} />
              <AdminInfo label="Altersklasse" value={tournament.ageGroup} />
            </dl>
          </AdminCard>

          <AdminCard title="Hinweise">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <AdminInfo
                label="Bemerkungen"
                value={application.notes ?? "Keine Angabe"}
              />
              <AdminInfo
                label="Begleitpersonen"
                value={
                  application.staffCount === null
                    ? "Keine Angabe"
                    : String(application.staffCount)
                }
              />
            </dl>
          </AdminCard>

          <PaymentStatusPanel
            applicationId={application.id}
            applicationStatus={application.applicationStatus}
            payment={{
              paymentStatus: application.paymentStatus,
              participationFee: application.participationFee,
              paidAt: application.paidAt,
              paymentNote: application.paymentNote,
            }}
          />

          <TeamDirectorySavePanel
            applicationId={application.id}
            canManage={canManageTeamDirectory}
          />

          <InternalRating
            category={application.internalCategory}
            strength={application.internalStrength}
            notes={application.internalNotes}
            onCategoryChange={(internalCategory) =>
              updateInternalRating(application.id, { internalCategory })
            }
            onStrengthChange={(internalStrength) =>
              updateInternalRating(application.id, { internalStrength })
            }
            onNotesChange={(internalNotes) =>
              updateInternalRating(application.id, { internalNotes })
            }
          />
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-8 lg:self-start">
          <section className={`${adminCardShellClass} p-4 sm:p-5`}>
            <h2 className={adminSectionTitleClass}>Entscheidung</h2>
            {summary.isFull ? (
              <p className="mt-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Turnier ausgebucht
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              {decisions.map((decision) => {
                const disabled =
                  saving || (decision.status === "accepted" && !canAccept);

                return (
                  <button
                    key={decision.status}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPendingStatus(decision.status)}
                    className={
                      decision.status === "accepted"
                        ? adminPrimaryButtonClass
                        : adminSecondaryButtonClass
                    }
                  >
                    {decision.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${adminCardShellClass} p-4 sm:p-5`}>
            <h2 className={adminSectionTitleClass}>Verwaltung</h2>
            <p className="mt-3 text-[13px] leading-5 text-muted">
              Archivieren blendet die Bewerbung nur in der Admin-Liste aus. Status,
              Turnierteilnahme und Kapazität bleiben unverändert.
            </p>
            {application.archivedAt ? (
              <p className="mt-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Archiviert
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              {application.archivedAt ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmAction("restore")}
                  className={adminSecondaryButtonClass}
                >
                  Wiederherstellen
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmAction("archive")}
                  className={adminSecondaryButtonClass}
                >
                  Archivieren
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmAction("delete")}
                className={adminDestructiveButtonClass}
              >
                Bewerbung löschen
              </button>
            </div>
          </section>

          <section className={`${adminCardShellClass} p-4 sm:p-5`}>
            <h2 className={adminSectionTitleClass}>Turnierfeld</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <AdminInfo label="Max Teams" value={String(tournament.maxTeams)} />
              <AdminInfo label="Bestätigt" value={String(summary.confirmedTeams)} />
              <AdminInfo
                label="Freie Plätze"
                value={String(summary.availableSlots)}
              />
              <AdminInfo
                label="Offene Bewerbungen"
                value={String(summary.openApplications)}
              />
              <AdminInfo label="Warteliste" value={String(summary.waitlistCount)} />
            </dl>
            <p className="mt-5 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              Kategorie bestätigt
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {(["S", "A", "B", "C"] as const).map((category) => (
                <div
                  key={category}
                  className="rounded-lg bg-surface px-2 py-2"
                >
                  <p className="text-[11px] font-semibold text-muted">{category}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink">
                    {summary.composition[category]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={pendingStatus !== null}
        title={pendingStatus ? getStatusDecisionCopy(pendingStatus) : ""}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => {
          if (!pendingStatus) {
            return;
          }

          const nextStatus = pendingStatus;
          setPendingStatus(null);
          setSaving(true);
          setNotice(null);
          setStatusError(null);

          void updateStatus(application.id, nextStatus)
            .then((result) => {
              setNotice(result.notice);
              setStatusError(result.error);
              setSaving(false);
            })
            .catch(() => {
              setStatusError(
                "Der Status wurde gespeichert, aber die Rückmeldung konnte nicht abgeschlossen werden. Bitte Seite neu laden.",
              );
              setSaving(false);
            });
        }}
      />

      <ConfirmModal
        open={confirmAction !== null}
        title={
          confirmAction === "archive"
            ? "Bewerbung archivieren?"
            : confirmAction === "restore"
              ? "Bewerbung wiederherstellen?"
              : "Bewerbung endgültig löschen?"
        }
        confirmLabel={
          confirmAction === "delete"
            ? "Endgültig löschen"
            : confirmAction === "restore"
              ? "Wiederherstellen"
              : "Archivieren"
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) {
            return;
          }

          const action = confirmAction;
          setConfirmAction(null);
          setSaving(true);
          setNotice(null);
          setStatusError(null);

          const run =
            action === "archive"
              ? archiveApplication(application.id)
              : action === "restore"
                ? restoreApplication(application.id)
                : deleteApplication(application.id);

          void run
            .then((result) => {
              if (result.error) {
                setStatusError(result.error);
                setSaving(false);
                return;
              }

              if (action === "delete") {
                router.push("/admin/bewerbungen");
                router.refresh();
                return;
              }

              setNotice(result.notice);
              setSaving(false);
              router.refresh();
            })
            .catch(() => {
              setStatusError(
                "Die Aktion konnte nicht abgeschlossen werden. Bitte Seite neu laden.",
              );
              setSaving(false);
            });
        }}
      >
        {confirmAction === "archive" ? (
          <p className="text-[14px] leading-6 text-muted">
            <span className="font-medium text-ink">
              {application.clubName} · {application.teamName}
            </span>
            <br />
            Die Bewerbung wird nur in der normalen Liste ausgeblendet. Status,
            Teilnahme und Kapazität bleiben unverändert.
          </p>
        ) : null}
        {confirmAction === "restore" ? (
          <p className="text-[14px] leading-6 text-muted">
            <span className="font-medium text-ink">
              {application.clubName} · {application.teamName}
            </span>
            <br />
            Die Bewerbung erscheint wieder in der aktiven Liste.
          </p>
        ) : null}
        {confirmAction === "delete" ? (
          <p className="text-[14px] leading-6 text-muted">
            <span className="font-medium text-ink">
              {application.clubName} · {application.teamName}
            </span>
            <br />
            Diese Aktion ist endgültig. Bewerbungen mit Turnier- oder Historiendaten
            werden serverseitig blockiert — bitte dann archivieren.
          </p>
        ) : null}
      </ConfirmModal>
    </div>
  );
}
