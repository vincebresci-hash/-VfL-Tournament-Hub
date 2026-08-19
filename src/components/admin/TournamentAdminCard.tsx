import Link from "next/link";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { formatDateDe } from "@/lib/format";
import type { CategoryComposition } from "@/lib/admin";
import type { Tournament } from "@/types/tournament";

type TournamentAdminCardProps = {
  tournament: Tournament;
  confirmedTeams: number;
  applicationsCount: number;
  waitlistCount: number;
  composition?: CategoryComposition;
};

export function TournamentAdminCard({
  tournament,
  confirmedTeams,
  applicationsCount,
  waitlistCount,
  composition,
}: TournamentAdminCardProps) {
  return (
    <article className="border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            {tournament.name}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {formatDateDe(tournament.date)} · {tournament.ageGroup}
          </p>
        </div>
        <StatusBadge status={tournament.status} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px] text-muted sm:grid-cols-4">
        <Stat label="Max Teams" value={String(tournament.maxTeams)} />
        <Stat label="Bestätigt" value={String(confirmedTeams)} />
        <Stat label="Bewerbungen" value={String(applicationsCount)} />
        <Stat label="Warteliste" value={String(waitlistCount)} />
      </dl>

      <p className="mt-4 text-[14px] text-ink">
        {confirmedTeams} / {tournament.maxTeams} Teams bestätigt
      </p>
      <p className="mt-1 text-[13px] text-muted">{applicationsCount} Bewerbungen</p>

      {composition ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
            Interne Übersicht bestätigt
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {(["S", "A", "B", "C"] as const).map((category) => (
              <div key={category} className="bg-surface px-2 py-2">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {category}
                </p>
                <p className="mt-1 font-display text-lg font-bold text-ink">
                  {composition[category]}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/admin/turniere/${tournament.slug}`}
          className="inline-flex h-9 items-center border border-line px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          Bearbeiten
        </Link>
        <Link
          href={`/admin/bewerbungen?turnier=${tournament.id}`}
          className="inline-flex h-9 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Bewerbungen
        </Link>
        <Link
          href={`/turniere/${tournament.slug}`}
          className="inline-flex h-9 items-center px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          Ansehen
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
