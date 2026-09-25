"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AdminCard,
  AdminInfo,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { checkMeinTurnierplanConnectionAction } from "@/lib/db/mein-turnierplan-actions";
import { isNumericMeinTurnierplanTournamentId } from "@/lib/mein-turnierplan";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication } from "@/types/application";

type TournamentSyncAdminPanelProps = {
  tournament: AdminTournamentRecord;
  applications?: AdminApplication[];
  detectedExternalTeamCount?: number;
};

function formatSyncedAt(value: string | null | undefined) {
  if (!value) {
    return "Noch nie";
  }

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * B1-A: Presentation / connection status only.
 * Competition sync (Preview + Confirm → RPC) is disabled.
 */
export function TournamentSyncAdminPanel({
  tournament,
}: TournamentSyncAdminPanelProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);

  const trimmedId = tournament.meinTurnierplanTournamentId?.trim() ?? "";
  const hasNumericId = isNumericMeinTurnierplanTournamentId(trimmedId);
  const hasWidgetUrl = Boolean(
    tournament.meinTurnierplanMatchesWidgetUrl?.trim() ||
      tournament.meinTurnierplanTableWidgetUrl?.trim(),
  );
  const canQuery = hasNumericId || hasWidgetUrl;

  async function handleCheckConnection() {
    if (!canQuery) {
      setError("Bitte Widget-URL oder Turnier-ID hinterlegen.");
      return;
    }

    setChecking(true);
    setError(null);
    setNotice(null);
    const result = await checkMeinTurnierplanConnectionAction(trimmedId, {
      matchesWidgetUrl: tournament.meinTurnierplanMatchesWidgetUrl,
      tableWidgetUrl: tournament.meinTurnierplanTableWidgetUrl,
    });
    setChecking(false);
    if (result.error) {
      setError(result.error);
      setConnectionOk(false);
      return;
    }
    setConnectionOk(true);
    setNotice("Verbindung zu MeinTurnierplan erfolgreich geprüft.");
  }

  return (
    <AdminCard title="MeinTurnierPlan">
      <p className="text-[14px] leading-6 text-muted">
        MeinTurnierPlan wird für die öffentliche Anzeige und externe
        Turnierinformationen verwendet.
      </p>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        Die Turnierdaten werden im VfL Tournament Hub verwaltet.
      </p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <AdminInfo
          label="MeinTurnierPlan"
          value={
            connectionOk === true
              ? "Verbunden"
              : canQuery
                ? "Konfiguriert"
                : "Nicht bereit"
          }
        />
        <AdminInfo
          label="Verwendung"
          value="Öffentliche Anzeige · externer Spielplan-Link"
        />
        <AdminInfo
          label="Turnierdaten"
          value="Hub (Teilnehmer, Gruppen, Spielplan, Ergebnisse, KO)"
        />
        <AdminInfo
          label="Letzte Synchronisierung (historisch)"
          value={formatSyncedAt(tournament.meinTurnierplanLastSyncedAt)}
        />
        <AdminInfo
          label="Quelle / Turnier-ID"
          value={displayValue(tournament.meinTurnierplanTournamentId)}
        />
        <AdminInfo
          label="Spielplan-Widget"
          value={displayValue(tournament.meinTurnierplanMatchesWidgetUrl)}
        />
        <AdminInfo
          label="Tabellen-Widget"
          value={displayValue(tournament.meinTurnierplanTableWidgetUrl)}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={checking}
          onClick={handleCheckConnection}
          className={adminSecondaryButtonClass}
        >
          {checking ? "Prüfe…" : "Verbindung prüfen"}
        </button>
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className={adminPrimaryButtonClass}
        >
          MTP-Konfiguration bearbeiten
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/admin/turniere/${tournament.id}/gruppen`}
          className={adminSecondaryButtonClass}
        >
          Hub: Gruppen
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/spielplan`}
          className={adminSecondaryButtonClass}
        >
          Hub: Spielplan
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/ergebnisse`}
          className={adminSecondaryButtonClass}
        >
          Hub: Ergebnisse
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/ko-runde`}
          className={adminSecondaryButtonClass}
        >
          Hub: KO
        </Link>
      </div>

      <div className={`mt-5 ${adminCardShellClass} border-dashed px-4 py-3`}>
        <p className="text-[13px] leading-6 text-muted">
          Die Übernahme von Teilnehmer-, Gruppen-, Spielplan-, Ergebnis- und
          KO-Daten aus MeinTurnierPlan in den Hub ist deaktiviert. Competition
          Data wird ausschließlich im Hub gepflegt.
        </p>
      </div>

      {error ? (
        <p
          className={`mt-5 ${adminCardShellClass} border-[#d9b0b0] bg-[#fff5f5] px-4 py-3 text-[14px] text-[#9a2b2b]`}
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-5 ${adminCardShellClass} px-4 py-3 text-[14px] text-ink`}>
          {notice}
        </p>
      ) : null}
    </AdminCard>
  );
}
