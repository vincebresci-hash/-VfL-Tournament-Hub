import Link from "next/link";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { formatDateDe } from "@/lib/format";
import { tournamentStageStatusLabel, type TournamentStageStatus } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";
import type { ReactNode } from "react";

type NavKey = "overview" | "applications" | "participants" | "groups" | "schedule" | "results";

type TournamentAdminChromeProps = {
  tournament: AdminTournamentRecord;
  stageStatus: TournamentStageStatus;
  current: NavKey;
  children?: ReactNode;
};

const navClass = (active: boolean) =>
  active
    ? "inline-flex h-9 items-center bg-navy px-3 text-[11px] font-semibold tracking-[0.08em] text-white uppercase"
    : "inline-flex h-9 items-center border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20";

export function TournamentAdminChrome({
  tournament,
  stageStatus,
  current,
  children,
}: TournamentAdminChromeProps) {
  const base = `/admin/turniere/${tournament.id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/turniere"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Turniere
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
            {tournament.name}
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {formatDateDe(tournament.date)} · {tournament.ageGroup}
            {tournament.location ? ` · ${tournament.location}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex bg-brand-yellow px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-navy uppercase">
            {tournamentStageStatusLabel[stageStatus]}
          </span>
          <StatusBadge status={tournament.status} />
          <Link
            href={`${base}/bearbeiten`}
            className="inline-flex h-9 items-center bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
          >
            Bearbeiten
          </Link>
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Turnierbereiche">
        <Link href={base} className={navClass(current === "overview")}>
          Übersicht
        </Link>
        <Link
          href={`/admin/bewerbungen?turnier=${tournament.slug}`}
          className={navClass(current === "applications")}
        >
          Bewerbungen
        </Link>
        <Link href={`${base}?bereich=teilnehmer`} className={navClass(current === "participants")}>
          Teilnehmer
        </Link>
        <Link href={`${base}/gruppen`} className={navClass(current === "groups")}>
          Gruppen
        </Link>
        <Link href={`${base}/spielplan`} className={navClass(current === "schedule")}>
          Spielplan
        </Link>
        <Link href={`${base}/ergebnisse`} className={navClass(current === "results")}>
          Ergebnisse
        </Link>
      </nav>

      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
