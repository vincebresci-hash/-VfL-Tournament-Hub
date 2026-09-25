"use client";

import { useState } from "react";
import {
  adminCardShellClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { checkMeinTurnierplanConnectionAction } from "@/lib/db/mein-turnierplan-actions";
import { isNumericMeinTurnierplanTournamentId } from "@/lib/mein-turnierplan";
import { hubTeamLabel } from "@/lib/mein-turnierplan-import";
import type { AdminApplication } from "@/types/application";

type MeinTurnierplanAdminToolsProps = {
  tournamentIdValue: string;
  matchesWidgetUrl?: string | null;
  tableWidgetUrl?: string | null;
  hasWidgetUrl?: boolean;
};

const NUMERIC_ID_REQUIRED_HINT =
  "Für die Verbindungsprüfung wird die numerische MeinTurnierplan Turnier-ID oder eine hinterlegte Widget-URL benötigt.";

/**
 * B1-A: Connection diagnostics only.
 * Competition import (Gruppen & Teams → Hub) is disabled.
 */
export function MeinTurnierplanAdminTools({
  tournamentIdValue,
  matchesWidgetUrl,
  tableWidgetUrl,
  hasWidgetUrl = false,
}: MeinTurnierplanAdminToolsProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);

  const trimmedId = tournamentIdValue.trim();
  const hasNumericId = isNumericMeinTurnierplanTournamentId(trimmedId);
  const canQueryJson = hasNumericId || hasWidgetUrl;
  const widgetOptions = {
    matchesWidgetUrl,
    tableWidgetUrl,
  };

  async function handleCheckConnection() {
    if (!canQueryJson) {
      setError(NUMERIC_ID_REQUIRED_HINT);
      return;
    }

    setChecking(true);
    setError(null);
    setNotice(null);
    setConnectionOk(null);

    const result = await checkMeinTurnierplanConnectionAction(trimmedId, widgetOptions);
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
    <div className="mt-5 grid gap-4">
      {hasWidgetUrl && !hasNumericId ? (
        <p className={`${adminCardShellClass} px-4 py-3 text-[13px] leading-6 text-muted`}>
          Live-Widgets funktionieren mit den hinterlegten Widget-URLs. Für die
          Verbindungsprüfung wird die numerische Turnier-ID oder der id-Parameter der
          Widget-URL verwendet.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={checking}
          onClick={handleCheckConnection}
          className={adminSecondaryButtonClass}
        >
          {checking ? "Prüfe…" : "Verbindung prüfen"}
        </button>
      </div>

      {connectionOk === true ? (
        <p className="text-[13px] text-ink">Verbindungsstatus: OK</p>
      ) : null}

      {error ? (
        <p
          className={`${adminCardShellClass} border-[#d9b0b0] bg-[#fff5f5] px-4 py-3 text-[14px] text-[#9a2b2b]`}
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className={`${adminCardShellClass} px-4 py-3 text-[14px] text-ink`}>{notice}</p>
      ) : null}
    </div>
  );
}

export function acceptedTeamsFromApplications(applications: AdminApplication[]) {
  return applications
    .filter((application) => application.applicationStatus === "accepted")
    .map((application) => ({
      applicationId: application.id,
      label: hubTeamLabel({
        applicationId: application.id,
        clubName: application.clubName,
        teamName: application.teamName,
      }),
    }));
}
