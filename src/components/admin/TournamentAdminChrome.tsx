import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import {
  adminCompactPrimaryButtonClass,
  adminIdentityHeroClass,
  adminStatusBadgeClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { tournamentStageStatusLabel, type TournamentStageStatus } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";

type NavKey =
  | "overview"
  | "applications"
  | "participants"
  | "groups"
  | "schedule"
  | "results"
  | "knockout";

type TournamentAdminChromeProps = {
  tournament: AdminTournamentRecord;
  stageStatus: TournamentStageStatus;
  current: NavKey;
  children?: ReactNode;
};

type NavItem = {
  key: NavKey;
  label: string;
  href: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

function navClass(active: boolean) {
  return active
    ? "inline-flex h-9 shrink-0 items-center rounded-lg border border-brand-yellow bg-[#fff8e0] px-3 text-[11px] font-semibold tracking-[0.06em] text-navy uppercase"
    : "inline-flex h-9 shrink-0 items-center rounded-lg border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:border-navy/20 hover:bg-surface";
}

export function TournamentAdminChrome({
  tournament,
  stageStatus,
  current,
  children,
}: TournamentAdminChromeProps) {
  const base = `/admin/turniere/${tournament.id}`;

  const groups: NavGroup[] = [
    {
      label: "Übersicht",
      items: [
        { key: "overview", label: "Übersicht", href: base },
        {
          key: "applications",
          label: "Bewerbungen",
          href: `/admin/bewerbungen?turnier=${tournament.slug}`,
        },
        {
          key: "participants",
          label: "Teilnehmer",
          href: `${base}?bereich=teilnehmer`,
        },
      ],
    },
    {
      label: "Vorbereitung",
      items: [
        { key: "groups", label: "Gruppen", href: `${base}/gruppen` },
        { key: "schedule", label: "Spielplan", href: `${base}/spielplan` },
      ],
    },
    {
      label: "Durchführung",
      items: [
        { key: "results", label: "Ergebnisse", href: `${base}/ergebnisse` },
        { key: "knockout", label: "KO-Runde", href: `${base}/ko-runde` },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/turniere"
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Turniere
      </Link>

      <div className={`mt-4 ${adminIdentityHeroClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
              {tournament.name}
            </h1>
            <p className="mt-1 text-[15px] text-muted">
              {formatDateDe(tournament.date)} · {tournament.ageGroup}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span
              className={`${adminStatusBadgeClass} bg-brand-yellow text-navy`}
            >
              {tournamentStageStatusLabel[stageStatus]}
            </span>
            <StatusBadge status={tournament.status} />
            <Link href={`${base}/bearbeiten`} className={adminCompactPrimaryButtonClass}>
              Bearbeiten
            </Link>
          </div>
        </div>
      </div>

      <nav
        className="mt-5 -mx-1 overflow-x-auto pb-1"
        aria-label="Turnierbereiche"
      >
        <div className="flex min-w-min items-end gap-5 px-1">
          {groups.map((group) => (
            <div key={group.label} className="shrink-0">
              <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
                {group.label}
              </p>
              <div className="flex gap-2">
                {group.items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={navClass(current === item.key)}
                    aria-current={current === item.key ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
