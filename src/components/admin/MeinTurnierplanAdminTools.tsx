"use client";

import { useMemo, useState } from "react";
import {
  adminCardShellClass,
  adminFilterControlClass,
  adminMobileCardClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSectionTitleClass,
} from "@/components/admin/AdminPanel";
import {
  checkMeinTurnierplanConnectionAction,
  importMeinTurnierplanGroupsAction,
  loadMeinTurnierplanPreviewForTournamentAction,
} from "@/lib/db/mein-turnierplan-actions";
import { isNumericMeinTurnierplanTournamentId } from "@/lib/mein-turnierplan";
import { hubTeamLabel } from "@/lib/mein-turnierplan-import";
import type { MeinTurnierplanImportGroup } from "@/lib/mein-turnierplan-import";
import type { MeinTurnierplanPreview } from "@/lib/mein-turnierplan-api";
import type { MeinTurnierplanRawMeta } from "@/lib/mein-turnierplan-normalize";
import type { AdminApplication } from "@/types/application";

type AcceptedTeamOption = {
  applicationId: string;
  label: string;
};

type MeinTurnierplanAdminToolsProps = {
  tournamentId: string;
  tournamentIdValue: string;
  matchesWidgetUrl?: string | null;
  tableWidgetUrl?: string | null;
  acceptedTeams: AcceptedTeamOption[];
  hasWidgetUrl?: boolean;
  onImportComplete?: () => void;
};

const NUMERIC_ID_REQUIRED_HINT =
  "Für diese Funktion wird die numerische MeinTurnierplan Turnier-ID oder eine hinterlegte Widget-URL benötigt.";

export function MeinTurnierplanAdminTools({
  tournamentId,
  tournamentIdValue,
  matchesWidgetUrl,
  tableWidgetUrl,
  acceptedTeams,
  hasWidgetUrl = false,
  onImportComplete,
}: MeinTurnierplanAdminToolsProps) {
  const [checking, setChecking] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<MeinTurnierplanPreview | null>(null);
  const [previewMeta, setPreviewMeta] = useState<MeinTurnierplanRawMeta | null>(null);
  const [mappingGroups, setMappingGroups] = useState<MeinTurnierplanImportGroup[]>(
    [],
  );
  const [showImport, setShowImport] = useState(false);

  const trimmedId = tournamentIdValue.trim();
  const hasNumericId = isNumericMeinTurnierplanTournamentId(trimmedId);
  const canQueryJson = hasNumericId || hasWidgetUrl;
  const widgetOptions = {
    matchesWidgetUrl,
    tableWidgetUrl,
  };

  const acceptedOptions = useMemo(
    () =>
      acceptedTeams.map((team) => ({
        value: team.applicationId,
        label: team.label,
      })),
    [acceptedTeams],
  );

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

  async function handleLoadPreview() {
    if (!canQueryJson) {
      setError(NUMERIC_ID_REQUIRED_HINT);
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    setPreviewMeta(null);
    setMappingGroups([]);
    setShowImport(false);

    const result = await loadMeinTurnierplanPreviewForTournamentAction(
      tournamentId,
      trimmedId,
    );
    setLoadingPreview(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPreview(result.preview);
    setPreviewMeta(result.meta);
    setMappingGroups(result.mappingGroups ?? []);
    setNotice("Gruppen- und Team-Vorschau geladen. Es wurde nichts gespeichert.");
  }

  function updateMapping(
    groupIndex: number,
    teamIndex: number,
    applicationId: string | null,
  ) {
    setMappingGroups((current) =>
      current.map((group, index) =>
        index !== groupIndex
          ? group
          : {
              ...group,
              assignments: group.assignments.map((assignment, assignmentIndex) =>
                assignmentIndex !== teamIndex
                  ? assignment
                  : { ...assignment, applicationId },
              ),
            },
      ),
    );
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setNotice(null);

    const result = await importMeinTurnierplanGroupsAction(
      tournamentId,
      mappingGroups,
    );
    setImporting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.notice);
    setShowImport(false);
    onImportComplete?.();
  }

  return (
    <div className="mt-5 grid gap-4">
      {hasWidgetUrl && !hasNumericId ? (
        <p className={`${adminCardShellClass} px-4 py-3 text-[13px] leading-6 text-muted`}>
          Live-Widgets funktionieren mit den hinterlegten Widget-URLs. Für Gruppen &
          Teams wird die numerische Turnier-ID oder der id-Parameter der Widget-URL
          verwendet.
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
        <button
          type="button"
          disabled={loadingPreview}
          onClick={handleLoadPreview}
          className={adminSecondaryButtonClass}
        >
          {loadingPreview ? "Lade…" : "Gruppen & Teams laden"}
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

      {preview ? (
        <section className={`${adminCardShellClass} p-4 sm:p-5`}>
          <h3 className={adminSectionTitleClass}>MeinTurnierplan Rohdaten erkannt</h3>
          {previewMeta ? (
            <dl className="mt-3 grid gap-2 text-[13px] text-muted sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-ink">Schema/Version</dt>
                <dd>{previewMeta.schemaVersion ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Gruppen</dt>
                <dd>{previewMeta.groupCount}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Teams gesamt</dt>
                <dd>{previewMeta.teamCount}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Teilnehmer erkannt</dt>
                <dd>{previewMeta.participantCount}</dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-4 text-[14px] text-ink">
            Turnier: {preview.tournamentName?.trim() ? preview.tournamentName : "—"}
          </p>
          <p className="mt-4 text-[13px] font-semibold tracking-[0.08em] text-ink uppercase">
            Normalisierte Vorschau
          </p>

          {preview.groups.length === 0 ? (
            <p className="mt-4 text-[14px] text-muted">
              Keine Gruppen in den Turnierdaten gefunden.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4">
              {preview.groups.map((group) => (
                <li key={group.name}>
                  <p className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                    {group.name}
                  </p>
                  {group.teams.length === 0 ? (
                    <p className="mt-2 text-[13px] text-muted">Keine Teams</p>
                  ) : (
                    <ul className="mt-2 grid gap-1">
                      {group.teams.map((team) => (
                        <li key={`${group.name}-${team.id}`} className="text-[14px] text-ink">
                          {team.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {mappingGroups.length > 0 ? (
            <div className="mt-6">
              {!showImport ? (
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className={adminPrimaryButtonClass}
                >
                  In Hub übernehmen
                </button>
              ) : (
                <div className="grid gap-5">
                  <p className="text-[13px] leading-6 text-muted">
                    Bitte jede Zuordnung prüfen. Es werden nur exakt übereinstimmende
                    Vorschläge vorausgewählt. Nicht zuordenbare Teams bleiben
                    unzugeordnet.
                  </p>
                  {mappingGroups.map((group, groupIndex) => (
                    <div key={group.name} className={adminMobileCardClass}>
                      <p className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                        {group.name}
                      </p>
                      <ul className="mt-3 grid gap-3">
                        {group.assignments.map((assignment, teamIndex) => (
                          <li
                            key={`${group.name}-${assignment.mtpTeamName}`}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center"
                          >
                            <span className="text-[14px] text-ink">
                              {assignment.mtpTeamName}
                            </span>
                            <select
                              value={assignment.applicationId ?? ""}
                              onChange={(event) =>
                                updateMapping(
                                  groupIndex,
                                  teamIndex,
                                  event.target.value || null,
                                )
                              }
                              className={adminFilterControlClass}
                            >
                              <option value="">Nicht zugeordnet</option>
                              {acceptedOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleImport}
                      className={adminPrimaryButtonClass}
                    >
                      {importing ? "Übernehme…" : "Zuordnung bestätigen & importieren"}
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => setShowImport(false)}
                      className={adminSecondaryButtonClass}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
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
