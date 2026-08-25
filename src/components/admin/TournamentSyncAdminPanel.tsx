"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import {
  checkMeinTurnierplanConnectionAction,
} from "@/lib/db/mein-turnierplan-actions";
import {
  confirmMeinTurnierplanSyncAction,
  previewMeinTurnierplanSyncAction,
} from "@/lib/db/mein-turnierplan-sync-actions";
import { confirmAllDetectedExternalTeamsAction } from "@/lib/db/mein-turnierplan-participants-actions";
import { isNumericMeinTurnierplanTournamentId } from "@/lib/mein-turnierplan";
import { hubTeamLabel } from "@/lib/mein-turnierplan-import";
import type { MeinTurnierplanSyncPreview, SyncOverridePolicy, SyncTeamMapping } from "@/lib/mein-turnierplan-sync";
import type { AdminTournamentRecord } from "@/types/admin";
import type { AdminApplication } from "@/types/application";

type AcceptedTeamOption = {
  applicationId: string;
  label: string;
};

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

export function TournamentSyncAdminPanel({
  tournament,
  applications = [],
  detectedExternalTeamCount = 0,
}: TournamentSyncAdminPanelProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<MeinTurnierplanSyncPreview | null>(null);
  const [mappings, setMappings] = useState<SyncTeamMapping[]>([]);
  const [overridePolicy, setOverridePolicy] = useState<SyncOverridePolicy>("keep-manual");

  const trimmedId = tournament.meinTurnierplanTournamentId?.trim() ?? "";
  const hasNumericId = isNumericMeinTurnierplanTournamentId(trimmedId);
  const hasWidgetUrl = Boolean(
    tournament.meinTurnierplanMatchesWidgetUrl?.trim() ||
      tournament.meinTurnierplanTableWidgetUrl?.trim(),
  );
  const canQuery = hasNumericId || hasWidgetUrl;

  const acceptedTeams: AcceptedTeamOption[] = useMemo(
    () =>
      applications
        .filter(
          (application) =>
            (application.tournamentId === tournament.id ||
              application.tournamentId === tournament.slug) &&
            application.applicationStatus === "accepted",
        )
        .map((application) => ({
          applicationId: application.id,
          label: hubTeamLabel({
            applicationId: application.id,
            clubName: application.clubName,
            teamName: application.teamName,
          }),
        })),
    [applications, tournament.id, tournament.slug],
  );

  const syncMeta = tournament.meinTurnierplanSyncMeta as
    | { counts?: Record<string, number>; queryId?: string }
    | null
    | undefined;

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

  async function handleLoadPreview() {
    if (!canQuery) {
      setError("Bitte Widget-URL oder Turnier-ID hinterlegen.");
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setNotice(null);
    const result = await previewMeinTurnierplanSyncAction(tournament.id, {
      overridePolicy,
    });
    setLoadingPreview(false);

    if (result.error || !result.preview) {
      setError(result.error ?? "Vorschau fehlgeschlagen.");
      setPreview(null);
      return;
    }

    setPreview(result.preview);
    setMappings(result.preview.mappings);
    setNotice("Synchronisations-Vorschau geladen. Es wurde noch nichts gespeichert.");
  }

  async function handleConfirmSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    const result = await confirmMeinTurnierplanSyncAction({
      tournamentId: tournament.id,
      mappings,
      overridePolicy,
    });
    setSyncing(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.notice);
    setPreview(null);
    router.refresh();
  }

  function updateMapping(externalId: string, applicationId: string | null) {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.externalId === externalId
          ? { ...mapping, applicationId, createExternal: true }
          : mapping,
      ),
    );
  }

  return (
    <AdminCard title="Turnierdaten & Synchronisation">
      <p className="text-[14px] leading-6 text-muted">
        Manuelle Bearbeitung bleibt über die bestehenden Admin-Bereiche möglich.
        MeinTurnierplan kann nach Vorschau und Bestätigung in den Hub übernommen
        werden – ohne Fake-Bewerbungen und ohne HTML-Scraping.
      </p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <AdminInfo
          label="MeinTurnierplan"
          value={connectionOk === true ? "Verbunden" : canQuery ? "Konfiguriert" : "Nicht bereit"}
        />
        <AdminInfo
          label="Letzte Synchronisierung"
          value={formatSyncedAt(tournament.meinTurnierplanLastSyncedAt)}
        />
        <AdminInfo
          label="Quelle"
          value={displayValue(
            (syncMeta?.queryId as string | undefined) ??
              tournament.meinTurnierplanTournamentId ??
              null,
          )}
        />
        <AdminInfo
          label="Letzter Stand"
          value={
            syncMeta?.counts
              ? `Teilnehmer ${syncMeta.counts.teamsFound ?? "—"} · Gruppen ${syncMeta.counts.groupsFound ?? "—"} · Spiele ${syncMeta.counts.matchesFound ?? "—"} · Ergebnisse ${syncMeta.counts.resultsPresent ?? "—"}`
              : "—"
          }
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/admin/turniere/${tournament.id}/gruppen`}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Manuell: Gruppen
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/spielplan`}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Manuell: Spielplan
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/ergebnisse`}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Manuell: Ergebnisse
        </Link>
        <Link
          href={`/admin/turniere/${tournament.id}/ko-runde`}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Manuell: KO
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={checking}
          onClick={handleCheckConnection}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 disabled:opacity-50"
        >
          {checking ? "Prüfe…" : "Verbindung prüfen"}
        </button>
        <button
          type="button"
          disabled={loadingPreview}
          onClick={handleLoadPreview}
          className="inline-flex h-11 items-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 disabled:opacity-50"
        >
          {loadingPreview ? "Lade…" : "Vorschau laden"}
        </button>
        <button
          type="button"
          disabled={loadingPreview}
          onClick={handleLoadPreview}
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-50"
        >
          Jetzt synchronisieren
        </button>
      </div>

      {detectedExternalTeamCount > 0 ? (
        <div className="mt-5 border border-line bg-white px-4 py-4">
          <p className="text-[14px] text-ink">
            {detectedExternalTeamCount} Teams erkannt · {detectedExternalTeamCount} noch nicht
            als Teilnehmer bestätigt
          </p>
          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              setError(null);
              setNotice(null);
              const result = await confirmAllDetectedExternalTeamsAction(tournament.id);
              setSyncing(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              setNotice(result.notice);
              router.refresh();
            }}
            className="mt-3 inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-50"
          >
            Alle als Teilnehmer bestätigen
          </button>
        </div>
      ) : null}

      <div className="mt-5 border border-dashed border-line bg-white px-4 py-3">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
          PDF importieren
        </p>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          Als separate Importfunktion vorbereitet (Upload → Extraktion → Vorschau → Mapping →
          Bestätigung). Noch nicht aktiv – wird nicht mit MeinTurnierplan-Sync vermischt.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 inline-flex h-10 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase opacity-60"
        >
          PDF importieren
        </button>
      </div>

      {error ? (
        <p className="mt-5 border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-5 border border-line bg-white px-4 py-3 text-[14px] text-ink">{notice}</p>
      ) : null}

      {preview ? (
        <section className="mt-6 border border-line bg-white p-5">
          <h3 className="font-display text-base font-bold tracking-wide text-ink uppercase">
            Synchronisations-Vorschau
          </h3>
          <p className="mt-2 text-[14px] text-ink">
            {preview.tournamentName ?? "MeinTurnierplan"} · Quelle {preview.queryId}
          </p>
          <ul className="mt-4 grid gap-2 text-[14px] text-ink">
            <li>
              Teilnehmer: {preview.counts.teamsFound} gefunden · +{preview.counts.teamsNew} neu · ~
              {preview.counts.teamsUnchanged} unverändert · {preview.counts.teamsUnmapped} ohne
              Hub-Zuordnung
            </li>
            <li>
              Gruppen: {preview.counts.groupsFound} gefunden · +{preview.counts.groupsNew} neu
              {preview.counts.groupsLinked > 0
                ? ` · ~${preview.counts.groupsLinked} wird verknüpft`
                : ""}
              {preview.counts.groupsUpdated > 0
                ? ` · ~${preview.counts.groupsUpdated} aktualisiert`
                : ""}
            </li>
            <li>
              Felder: {preview.counts.courtsFound} gefunden · +{preview.counts.courtsNew} neu
              {preview.counts.courtsLinked > 0
                ? ` · ~${preview.counts.courtsLinked} wird verknüpft`
                : ""}
            </li>
            <li>
              Spiele: {preview.counts.matchesFound} gefunden · +{preview.counts.matchesNew} neu · ~
              {preview.counts.matchesUpdated} aktualisiert
            </li>
            <li>
              Ergebnisse: {preview.counts.resultsPresent} vorhanden · {preview.counts.resultsOpen}{" "}
              noch offen
            </li>
            {preview.counts.manualOverridesProtected > 0 ? (
              <li>
                {preview.counts.manualOverridesProtected} manuell bearbeitete Datensätze würden
                geändert.
              </li>
            ) : null}
          </ul>

          {preview.counts.manualOverridesProtected > 0 ? (
            <fieldset className="mt-5 grid gap-2">
              <legend className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
                Manuelle Änderungen
              </legend>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input
                  type="radio"
                  checked={overridePolicy === "keep-manual"}
                  onChange={() => setOverridePolicy("keep-manual")}
                />
                Manuelle Änderungen behalten (Standard)
              </label>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input
                  type="radio"
                  checked={overridePolicy === "overwrite-manual"}
                  onChange={() => setOverridePolicy("overwrite-manual")}
                />
                Mit MeinTurnierplan überschreiben
              </label>
            </fieldset>
          ) : null}

          <div className="mt-6 grid gap-3">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
              Team-Zuordnung
            </p>
            {mappings.map((mapping) => (
              <div
                key={mapping.externalId}
                className="grid gap-2 border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center"
              >
                <div>
                  <p className="text-[14px] text-ink">{mapping.externalName}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    Quelle: MeinTurnierplan · {mapping.applicationId ? "Zuordnung gewählt" : "extern führen"}
                  </p>
                </div>
                <select
                  value={mapping.applicationId ?? ""}
                  onChange={(event) =>
                    updateMapping(mapping.externalId, event.target.value || null)
                  }
                  className="h-10 w-full border border-line bg-white px-3 text-[14px] text-ink"
                >
                  <option value="">Als externes Turnierteam führen</option>
                  {acceptedTeams.map((team) => (
                    <option key={team.applicationId} value={team.applicationId}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={syncing}
              onClick={handleConfirmSync}
              className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-50"
            >
              {syncing ? "Synchronisiere…" : "Synchronisation bestätigen"}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => setPreview(null)}
              className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
            >
              Abbrechen
            </button>
          </div>
        </section>
      ) : null}
    </AdminCard>
  );
}
