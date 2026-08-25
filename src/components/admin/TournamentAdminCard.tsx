import Link from "next/link";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { TournamentStatusCapacityNotice } from "@/components/admin/TournamentStatusCapacityNotice";
import { formatDateDe, formatTimeDe } from "@/lib/format";
import type { AdminTournamentRecord } from "@/types/admin";

type TournamentAdminCardProps = {
  tournament: AdminTournamentRecord;
  confirmedTeams: number;
  availableSlots: number;
  applicationsCount: number;
  waitlistCount: number;
  newCount: number;
};

export function TournamentAdminCard({
  tournament,
  confirmedTeams,
  availableSlots,
  applicationsCount,
  waitlistCount,
  newCount,
}: TournamentAdminCardProps) {
  const start = formatTimeDe(tournament.startTime);

  return (
    <article className="border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            {tournament.name}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {tournament.ageGroup}
            {tournament.birthYear ? ` · Jahrgang ${tournament.birthYear}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tournament.archivedAt ? (
            <span className="inline-flex bg-[#e8eaee] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              Archiviert
            </span>
          ) : null}
          <StatusBadge status={tournament.status} />
        </div>
      </div>

      <TournamentStatusCapacityNotice
        className="mt-4 border border-[#d9b0b0] bg-[#fff5f5] px-4 py-3 text-[13px] leading-6 text-[#9a2b2b]"
        dbStatus={tournament.status}
        maxTeams={tournament.maxTeams}
        confirmedParticipants={confirmedTeams}
        editHref={`/admin/turniere/${tournament.id}/bearbeiten`}
      />

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px] text-muted sm:grid-cols-4 xl:grid-cols-5">
        <Stat label="Datum" value={formatDateDe(tournament.date)} />
        <Stat label="Uhrzeit" value={start ?? "—"} />
        <Stat label="Ort" value={tournament.location || "—"} />
        <Stat
          label="Max. Teams"
          value={tournament.maxTeams == null ? "—" : String(tournament.maxTeams)}
        />
        <Stat label="Bestätigt" value={String(confirmedTeams)} />
        <Stat label="Freie Plätze" value={String(availableSlots)} />
        <Stat label="Warteliste" value={String(waitlistCount)} />
        <Stat label="Neue Bewerbungen" value={String(newCount)} />
      </dl>

      <p className="mt-4 text-[13px] text-muted">
        {confirmedTeams}
        {tournament.maxTeams != null ? ` / ${tournament.maxTeams}` : ""} bestätigt ·{" "}
        {applicationsCount} Bewerbungen gesamt
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className="inline-flex h-9 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Bearbeiten
        </Link>
        <Link
          href={`/admin/bewerbungen?turnier=${tournament.slug}`}
          className="inline-flex h-9 items-center border border-line px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          Bewerbungen
        </Link>
        <Link
          href={`/turniere/${tournament.slug}`}
          className="inline-flex h-9 items-center px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          Öffentliche Seite
        </Link>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
