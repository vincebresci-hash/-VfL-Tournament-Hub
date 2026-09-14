import Link from "next/link";
import {
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
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
  underReviewCount: number;
};

export function TournamentAdminCard({
  tournament,
  confirmedTeams,
  availableSlots,
  applicationsCount,
  waitlistCount,
  newCount,
  underReviewCount,
}: TournamentAdminCardProps) {
  const start = formatTimeDe(tournament.startTime);
  const capacityLabel =
    tournament.maxTeams == null
      ? `${confirmedTeams} bestätigt`
      : `${confirmedTeams} / ${tournament.maxTeams} bestätigt`;

  return (
    <article className="border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold tracking-wide text-ink uppercase">
            {tournament.name}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            <span className="font-medium text-ink">{formatDateDe(tournament.date)}</span>
            {" · "}
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PriorityStat label="Kapazität" value={capacityLabel} emphasize />
        <PriorityStat label="Frei" value={String(availableSlots)} />
        <PriorityStat label="Warteliste" value={String(waitlistCount)} />
        <PriorityStat
          label="Offen"
          value={String(newCount + underReviewCount)}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px] text-muted sm:grid-cols-4">
        <Stat label="Uhrzeit" value={start ?? "—"} />
        <Stat label="Ort" value={tournament.location || "—"} />
        <Stat
          label="Max. Teams"
          value={tournament.maxTeams == null ? "—" : String(tournament.maxTeams)}
        />
        <Stat label="Bewerbungen" value={String(applicationsCount)} />
      </dl>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href={`/admin/turniere/${tournament.id}`}
          className={`${adminCompactPrimaryButtonClass} w-full sm:w-auto`}
        >
          Öffnen
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className={`${adminCompactSecondaryButtonClass} w-full sm:w-auto`}
        >
          Bearbeiten
        </Link>
        <Link
          href={`/admin/bewerbungen?turnier=${tournament.slug}`}
          className={`${adminCompactSecondaryButtonClass} w-full sm:w-auto`}
        >
          Bewerbungen
        </Link>
        <Link
          href={`/turniere/${tournament.slug}`}
          className={`${adminTextLinkClass} w-full justify-center sm:w-auto sm:justify-start`}
        >
          Öffentliche Seite
        </Link>
      </div>
    </article>
  );
}

function PriorityStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "min-w-0 border border-brand-yellow/70 bg-[#fff8e0] px-3 py-2"
          : "min-w-0 border border-line bg-white px-3 py-2"
      }
    >
      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-lg font-bold tracking-wide text-ink">
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-ink">{value}</dd>
    </div>
  );
}
