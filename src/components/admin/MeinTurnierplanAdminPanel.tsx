"use client";

import Link from "next/link";
import {
  AdminCard,
  AdminInfo,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { MeinTurnierplanAdminTools } from "@/components/admin/MeinTurnierplanAdminTools";
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
}: MeinTurnierplanAdminPanelProps) {
  const active =
    tournament.meinTurnierplanEnabled &&
    isSafeHttpUrl(tournament.meinTurnierplanUrl ?? "");
  const url = tournament.meinTurnierplanUrl?.trim() ?? "";
  const liveDataSource = asLiveDataSource(tournament.liveDataSource);

  return (
    <AdminCard title="MeinTurnierplan">
      <dl className="grid gap-3 sm:grid-cols-2">
        <AdminInfo label="Status" value={active ? "Verbunden" : "Inaktiv"} />
        <AdminInfo
          label="Datenquelle"
          value={liveDataSourceLabels[liveDataSource]}
        />
        <AdminInfo
          label="Verwendung"
          value="Öffentliche Anzeige · externe Turnierinformationen"
        />
        <AdminInfo
          label="Turnierdaten"
          value="VfL Tournament Hub"
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

      <p className="mt-5 text-[14px] leading-6 text-muted">
        MeinTurnierPlan wird für die öffentliche Anzeige und externe
        Turnierinformationen verwendet. Die Turnierdaten werden im VfL
        Tournament Hub verwaltet.
      </p>
      <MeinTurnierplanAdminTools
        tournamentIdValue={tournament.meinTurnierplanTournamentId ?? ""}
        matchesWidgetUrl={tournament.meinTurnierplanMatchesWidgetUrl}
        tableWidgetUrl={tournament.meinTurnierplanTableWidgetUrl}
        hasWidgetUrl={Boolean(
          tournament.meinTurnierplanMatchesWidgetUrl?.trim() ||
            tournament.meinTurnierplanTableWidgetUrl?.trim(),
        )}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        {active ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={adminPrimaryButtonClass}
          >
            Öffnen
          </a>
        ) : null}
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className={adminSecondaryButtonClass}
        >
          Bearbeiten
        </Link>
      </div>
    </AdminCard>
  );
}
