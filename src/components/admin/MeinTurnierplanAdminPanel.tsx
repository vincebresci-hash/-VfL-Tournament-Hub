"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import {
  acceptedTeamsFromApplications,
  MeinTurnierplanAdminTools,
} from "@/components/admin/MeinTurnierplanAdminTools";
import {
  asLiveDataSource,
  isSafeHttpUrl,
} from "@/lib/mein-turnierplan";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication } from "@/types/application";

const liveDataSourceLabels = {
  hub: "Eigener Hub",
  "mein-turnierplan": "MeinTurnierplan",
  hybrid: "Hybrid",
} as const;

type MeinTurnierplanAdminPanelProps = {
  tournament: AdminTournamentRecord;
  applications?: AdminApplication[];
};

export function MeinTurnierplanAdminPanel({
  tournament,
  applications = [],
}: MeinTurnierplanAdminPanelProps) {
  const router = useRouter();
  const active =
    tournament.meinTurnierplanEnabled &&
    isSafeHttpUrl(tournament.meinTurnierplanUrl ?? "");
  const url = tournament.meinTurnierplanUrl?.trim() ?? "";
  const liveDataSource = asLiveDataSource(tournament.liveDataSource);
  const acceptedTeams = acceptedTeamsFromApplications(
    applications.filter(
      (application) =>
        application.tournamentId === tournament.id ||
        application.tournamentId === tournament.slug,
    ),
  );

  return (
    <AdminCard title="MeinTurnierplan">
      <dl className="grid gap-3 sm:grid-cols-2">
        <AdminInfo label="Status" value={active ? "Aktiv" : "Inaktiv"} />
        <AdminInfo
          label="Datenquelle"
          value={liveDataSourceLabels[liveDataSource]}
        />
        <AdminInfo
          label="Turnier-ID"
          value={displayValue(tournament.meinTurnierplanTournamentId)}
        />
        <AdminInfo
          label="Button-Beschriftung"
          value={displayValue(tournament.meinTurnierplanLabel)}
        />
        <AdminInfo label="Präsentations-Link" value={url ? url : "—"} />
        <AdminInfo
          label="Spielplan-Widget"
          value={displayValue(tournament.meinTurnierplanMatchesWidgetUrl)}
        />
        <AdminInfo
          label="Tabellen-Widget"
          value={displayValue(tournament.meinTurnierplanTableWidgetUrl)}
        />
      </dl>

      <MeinTurnierplanAdminTools
        tournamentId={tournament.id}
        tournamentIdValue={tournament.meinTurnierplanTournamentId ?? ""}
        matchesWidgetUrl={tournament.meinTurnierplanMatchesWidgetUrl}
        tableWidgetUrl={tournament.meinTurnierplanTableWidgetUrl}
        hasWidgetUrl={Boolean(
          tournament.meinTurnierplanMatchesWidgetUrl?.trim() ||
            tournament.meinTurnierplanTableWidgetUrl?.trim(),
        )}
        acceptedTeams={acceptedTeams}
        onImportComplete={() => router.refresh()}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        {active ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            Öffnen
          </a>
        ) : null}
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          Bearbeiten
        </Link>
      </div>
    </AdminCard>
  );
}
