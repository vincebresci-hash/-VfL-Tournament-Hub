"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApplicationStatusBadge } from "@/components/admin/ApplicationStatusBadge";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { InternalRating } from "@/components/admin/InternalRating";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { AdminNotice } from "@/components/admin/AdminPanel";
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
}: ApplicationDetailProps) {
  const { getApplication, updateStatus, updateInternalRating, applications } =
    useAdminData();
  const application = getApplication(applicationId);
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!application) {
    return null;
  }

  const summary = getTournamentAdminSummary(tournament, applications);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/bewerbungen"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Bewerbungen
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            {application.clubName}
          </h1>
          <p className="mt-2 text-[15px] text-muted">{application.teamName}</p>
        </div>
        <ApplicationStatusBadge status={application.applicationStatus} />
      </div>

      {notice ? <AdminNotice>{notice}</AdminNotice> : null}
      {statusError ? (
        <p className="mt-6 border border-line bg-white px-5 py-4 text-[14px] text-[#9a2b2b]" role="alert">
          {statusError}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-5">
          <DetailCard title="Verein">
            <Info label="Vereinsname" value={application.clubName} />
            <Info label="Ort" value={application.clubCity} />
            <Info
              label="Website"
              value={application.website ?? "Keine Angabe"}
            />
            <Info
              label="Vereinstyp"
              value={getClubTypeLabel(application.clubType)}
            />
          </DetailCard>

          <DetailCard title="Mannschaft">
            <Info label="Mannschaftsname" value={application.teamName} />
            <Info label="Altersklasse" value={application.ageGroup} />
            <Info label="Jahrgang" value={String(application.birthYear)} />
            <Info label="Liga" value={application.league} />
            <Info label="Staffel" value={application.division ?? "Keine Angabe"} />
            <Info
              label="Selbsteinschätzung Spielstärke"
              value={`${application.selfRatedStrength}/5`}
            />
            <Info
              label="Beschreibung"
              value={application.teamDescription ?? "Keine Angabe"}
            />
          </DetailCard>

          <DetailCard title="Ansprechpartner">
            <Info label="Vorname" value={application.contactFirstName} />
            <Info label="Nachname" value={application.contactLastName} />
            <Info label="Funktion" value={application.contactRole} />
            <Info label="E-Mail" value={application.contactEmail} />
            <Info label="Telefon" value={application.contactPhone} />
            <Info
              label="Alternative Telefonnummer"
              value={application.alternativePhone ?? "Keine Angabe"}
            />
          </DetailCard>

          <DetailCard title="Turnier">
            <Info label="Turniername" value={tournament.name} />
            <Info label="Datum" value={formatDateDe(tournament.date)} />
            <Info label="Ort" value={tournament.location} />
            <Info label="Altersklasse" value={tournament.ageGroup} />
          </DetailCard>

          <DetailCard title="Hinweise">
            <Info
              label="Bemerkungen"
              value={application.notes ?? "Keine Angabe"}
            />
            <Info
              label="Begleitpersonen"
              value={
                application.staffCount === null
                  ? "Keine Angabe"
                  : String(application.staffCount)
              }
            />
          </DetailCard>

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

        <aside className="grid gap-5 lg:sticky lg:top-8 lg:self-start">
          <section className="border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Entscheidung
            </h2>
            <div className="mt-4 grid gap-2">
              {decisions.map((decision) => (
                <button
                  key={decision.status}
                  type="button"
                  disabled={saving}
                  onClick={() => setPendingStatus(decision.status)}
                  className={
                    decision.status === "accepted"
                      ? "inline-flex h-10 items-center justify-center bg-brand-yellow px-3 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                      : "inline-flex h-10 items-center justify-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  }
                >
                  {decision.label}
                </button>
              ))}
            </div>
          </section>

          <section className="border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Turnierfeld
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
              <Info label="Max Teams" value={String(tournament.maxTeams)} />
              <Info label="Bestätigt" value={String(summary.confirmedTeams)} />
              <Info
                label="Offene Bewerbungen"
                value={String(summary.openApplications)}
              />
              <Info label="Warteliste" value={String(summary.waitlistCount)} />
            </dl>
            <p className="mt-5 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              Kategorie bestätigt
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {(["S", "A", "B", "C"] as const).map((category) => (
                <div key={category} className="bg-surface px-2 py-2">
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

          void updateStatus(application.id, nextStatus).then((result) => {
            setNotice(result.notice);
            setStatusError(result.error);
            setSaving(false);
          });
        }}
      />
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
        {title}
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] leading-6 text-ink">{value}</dd>
    </div>
  );
}
