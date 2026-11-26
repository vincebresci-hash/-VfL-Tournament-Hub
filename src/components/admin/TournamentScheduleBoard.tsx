"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminCard,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { ChampionsLeagueScheduleFields } from "@/components/admin/ChampionsLeagueScheduleFields";
import { TournamentPlanPreviewPanel } from "@/components/admin/TournamentPlanPreviewPanel";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { applyChampionsLeagueScheduleAction } from "@/lib/db/league-schedule-actions";
import { applyTournamentPlanAction } from "@/lib/db/plan-apply-actions";
import { previewTournamentPlanAction } from "@/lib/db/plan-preview-actions";
import {
  deleteTournamentMatchAction,
  deleteTournamentScheduleAction,
  generateTournamentScheduleAction,
  saveScheduleSettingsAction,
  saveTournamentMatchAction,
} from "@/lib/db/schedule-actions";
import { isoToDatetimeLocal } from "@/lib/schedule/datetime";
import {
  ADMIN_COMPETITION_MODE_LABELS,
  buildChampionsLeagueAdminPreview,
  championsLeagueApplyBlockReason,
  championsLeagueParticipantIds,
  describeChampionsLeagueConfig,
  parseMatchesPerTeam,
  savedCompetitionMode,
  savedTournamentPlanTiming,
  SCHEDULE_CONFIG_LOCKED_MESSAGE,
  scheduleEditingEnabled,
  scheduleParametersEditable,
  type AdminCompetitionMode,
  type LeagueAdminParticipant,
  type LeagueKnockoutCutoff,
} from "@/lib/schedule/league-admin-preview";
import {
  canRegenerateGroupSchedule,
  type RegenerationPolicyResult,
  type TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";
import {
  GROUP_RESULT_LOCKED_MESSAGE,
  canMutateGroupResults,
} from "@/lib/schedule/group-result-lock";
import { GROUP_RESULT_LOCK_CORRECTION_MESSAGE } from "@/lib/schedule/group-result-lock-ux";
import { fieldDisplayName } from "@/lib/schedule/names";
import { matchSideParticipantId } from "@/lib/schedule/admin";
import { MATCH_STATUSES, type MatchStatus, type TournamentFieldRecord, type TournamentGroupRecord, type TournamentMatchRecord } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";

function previewIsApplicable(
  preview: TournamentPlanPreview,
  policy: RegenerationPolicyResult,
  allowChampionsLeague: boolean,
) {
  if (policy.decision !== "allowed" && policy.decision !== "allowedWithConfirmation") {
    return false;
  }
  if (preview.summary.fieldCount <= 0 || preview.matches.length <= 0) {
    return false;
  }
  if (
    preview.warnings.some(
      (warning) =>
        warning.code === "NO_FIELDS" ||
        warning.code === "TIMETABLE_INCOMPLETE" ||
        warning.code === "LEAGUE_CONFIG_INVALID",
    )
  ) {
    return false;
  }
  if (preview.mode === "champions-league") {
    const expected = preview.summary.expectedLeagueMatchCount;
    return (
      allowChampionsLeague &&
      expected != null &&
      preview.summary.scheduledLeagueMatchCount === expected &&
      preview.matches.every((match) => Boolean(match.scheduledAt) && Boolean(match.fieldId))
    );
  }
  return true;
}

function initialCompetitionMode(
  storedFormat: "round-robin" | "groups-knockout" | "champions-league" | null,
  groupCount: number,
): AdminCompetitionMode {
  if (
    storedFormat === "round-robin" ||
    storedFormat === "groups-knockout" ||
    storedFormat === "champions-league"
  ) {
    return storedFormat;
  }
  return savedCompetitionMode(groupCount);
}

const statusLabel: Record<MatchStatus, string> = {
  scheduled: "Geplant",
  live: "Live",
  completed: "Beendet",
  cancelled: "Abgesagt",
};

type TournamentScheduleBoardProps = {
  tournament: AdminTournamentRecord;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
  participants: LeagueAdminParticipant[];
  canScheduleManage: boolean;
  storedFormat: "round-robin" | "groups-knockout" | "champions-league" | null;
  storedLeagueMatchesPerTeam: number | null;
  storedKnockoutCutoff: 4 | 8 | 16 | null;
  storedRestrictSameClub?: boolean;
  /** Stable club identity per participant key (null = no shared club). */
  clubByParticipantId?: Record<string, string | null>;
  confirmedRosterError?: string | null;
};

export function TournamentScheduleBoard({
  tournament,
  groups,
  fields,
  matches,
  memberIdsByGroupId,
  teamLabels,
  participants,
  canScheduleManage,
  storedFormat,
  storedLeagueMatchesPerTeam,
  storedKnockoutCutoff,
  storedRestrictSameClub = false,
  clubByParticipantId = {},
  confirmedRosterError = null,
}: TournamentScheduleBoardProps) {
  const router = useRouter();
  const groupMatches = matches.filter((match) => match.phase !== "knockout");
  // Informational UI lock from loaded stage matches (includes KO). D1 server guard remains authoritative.
  const groupResultsLocked = !canMutateGroupResults(matches).allowed;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [duration, setDuration] = useState(String(tournament.matchDurationMinutes));
  const [breakMinutes, setBreakMinutes] = useState(String(tournament.breakMinutes));
  const [restMinutes, setRestMinutes] = useState(String(tournament.minimumRestMinutes));
  const [lunchStart, setLunchStart] = useState(tournament.lunchBreakStart ?? "");
  const [lunchEnd, setLunchEnd] = useState(tournament.lunchBreakEnd ?? "");
  const [fieldNames, setFieldNames] = useState(
    fields.length > 0 ? fields.map((field) => field.name) : [fieldDisplayName(0)],
  );
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmApplyReplace, setConfirmApplyReplace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TournamentPlanPreview | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<RegenerationPolicyResult | null>(null);
  const [previewApplyLocked, setPreviewApplyLocked] = useState(false);
  const [previewStatusMessage, setPreviewStatusMessage] = useState<string | null>(null);
  const savedMode = initialCompetitionMode(storedFormat, groups.length);
  const [competitionMode, setCompetitionMode] = useState<AdminCompetitionMode>(savedMode);
  const [leagueMatchesPerTeam, setLeagueMatchesPerTeam] = useState(
    storedLeagueMatchesPerTeam != null ? String(storedLeagueMatchesPerTeam) : "3",
  );
  const [leagueCutoff, setLeagueCutoff] = useState<LeagueKnockoutCutoff>(
    storedKnockoutCutoff ?? (participants.length >= 16 ? 16 : participants.length >= 8 ? 8 : 4),
  );
  const [restrictSameClub, setRestrictSameClub] = useState<boolean>(storedRestrictSameClub);
  const leagueParticipantIds = championsLeagueParticipantIds(participants);
  // Teams without a stable club id cannot be covered by the same-club rule, so
  // surface them instead of silently letting the restriction be bypassed.
  const sameClubUnverifiedCount = restrictSameClub
    ? leagueParticipantIds.filter((id) => !clubByParticipantId[id]).length
    : 0;
  const sameClubUnverifiedNames = restrictSameClub
    ? leagueParticipantIds
        .filter((id) => !clubByParticipantId[id])
        .map((id) => teamLabels[id] ?? "Unbenanntes Team")
    : [];
  const leagueDescription = describeChampionsLeagueConfig({
    participantIds: leagueParticipantIds,
    matchesPerTeam: parseMatchesPerTeam(leagueMatchesPerTeam),
    knockoutCutoff: leagueCutoff,
  });
  // Authoritative started/result protection, mirrored from the server policy.
  // Blocks only RESULTS_EXIST / LIVE / KO_STARTED / COMPLETED — never a mode
  // mismatch. A resultless existing schedule is replaceable with confirmation.
  const regenerationPolicy = canRegenerateGroupSchedule({
    tournamentStatus: tournament.status,
    groupCount: groups.length,
    matches: matches.map((match) => ({
      phase: match.phase,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
  });
  const scheduleConfigLocked = regenerationPolicy.decision === "blocked";
  // Tournament-wide draft parameters + fields are editable for ANY mode unless
  // the tournament is truly locked. This decouples the draft mode (what the
  // admin is configuring) from the saved mode (what is persisted).
  const parametersEditable = scheduleParametersEditable(scheduleConfigLocked);
  // Classic saved-schedule operations (direct generate, clear, classic preview).
  const classicModeActive = scheduleEditingEnabled(competitionMode, savedMode);
  // Per-match editing of the already saved schedule (works for a saved CL league too).
  const savedScheduleEditable = !scheduleConfigLocked && competitionMode === savedMode;
  const generateAllowed = parametersEditable && classicModeActive;
  const sameClubIdentityBlocked =
    competitionMode === "champions-league" && restrictSameClub && sameClubUnverifiedCount > 0;
  const previewAllowed =
    (competitionMode === "champions-league" || classicModeActive) && !sameClubIdentityBlocked;
  const championsLeagueApplyBlockReasonText =
    competitionMode === "champions-league"
      ? championsLeagueApplyBlockReason({
          storedFormat,
          groupCount: groups.length,
          policyBlocked: scheduleConfigLocked,
          policyReason: regenerationPolicy.reason,
        })
      : null;
  const championsLeagueApplyAllowed =
    competitionMode === "champions-league" && championsLeagueApplyBlockReasonText === null;

  function clearPreviewState() {
    setPreviewOpen(false);
    setPreviewError(null);
    setPreview(null);
    setPreviewPolicy(null);
    setPreviewApplyLocked(false);
    setPreviewStatusMessage(null);
    setConfirmApplyReplace(false);
  }

  function invalidateOpenPreview() {
    // After generate/delete/other schedule mutations, an open preview must not remain applicable.
    setPreview(null);
    setPreviewPolicy(null);
    setPreviewError(null);
    setPreviewApplyLocked(false);
    setPreviewStatusMessage(null);
    setConfirmApplyReplace(false);
    setPreviewOpen(false);
  }

  async function handlePreview() {
    if (competitionMode === "champions-league") {
      handleChampionsLeaguePreview();
      return;
    }
    if (competitionMode !== savedMode) {
      setPreview(null);
      setPreviewPolicy(null);
      setPreviewApplyLocked(false);
      setPreviewStatusMessage(null);
      setPreviewError(
        "Diese Auswahl folgt nicht der gespeicherten Turnierstruktur und wird weder erzeugt noch gespeichert.",
      );
      setPreviewOpen(true);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setError(null);
    setNotice(null);
    setPreviewApplyLocked(false);
    setPreviewStatusMessage(null);
    setConfirmApplyReplace(false);
    const result = await previewTournamentPlanAction(tournament.id);
    setPreviewLoading(false);
    if (result.error) {
      setPreviewError(result.error);
      setPreview(null);
      setPreviewPolicy(null);
      setPreviewOpen(true);
      return;
    }
    setPreview(result.preview);
    setPreviewPolicy(result.policy);
    setPreviewOpen(true);
  }

  function selectCompetitionMode(next: AdminCompetitionMode) {
    setCompetitionMode(next);
    clearPreviewState();
    setConfirmGenerate(false);
    setConfirmClear(false);
    setDeleteMatchId(null);
  }

  function requestClearSchedule() {
    if (!classicModeActive || scheduleConfigLocked) {
      setConfirmClear(false);
      return;
    }
    setConfirmClear(true);
  }

  function executeClearSchedule() {
    if (!classicModeActive || scheduleConfigLocked) {
      setConfirmClear(false);
      return;
    }
    setConfirmClear(false);
    void run(() => deleteTournamentScheduleAction(tournament.id));
  }

  function requestDeleteMatch(matchId: string) {
    if (!savedScheduleEditable) {
      setDeleteMatchId(null);
      return;
    }
    setDeleteMatchId(matchId);
  }

  function executeDeleteMatch() {
    if (!savedScheduleEditable) {
      setDeleteMatchId(null);
      return;
    }
    const id = deleteMatchId;
    setDeleteMatchId(null);
    if (id) {
      void run(() => deleteTournamentMatchAction(tournament.id, id));
    }
  }

  function saveExistingMatch(input: {
    matchId?: string;
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) {
    if (!savedScheduleEditable) {
      return Promise.resolve(false);
    }
    return run(() => saveTournamentMatchAction(tournament.id, input));
  }

  function addMatch(input: {
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) {
    if (!savedScheduleEditable) {
      return Promise.resolve(false);
    }
    return run(() => saveTournamentMatchAction(tournament.id, input));
  }

  function handleChampionsLeaguePreview() {
    setPreviewError(null);
    setError(null);
    setNotice(null);
    setPreviewApplyLocked(false);
    setPreviewStatusMessage(null);
    setConfirmApplyReplace(false);
    if (!canScheduleManage) {
      setPreview(null);
      setPreviewPolicy(null);
      setPreviewError("Keine Berechtigung für diese Aktion.");
      setPreviewOpen(true);
      return;
    }
    if (confirmedRosterError) {
      setPreview(null);
      setPreviewPolicy(null);
      setPreviewError(confirmedRosterError);
      setPreviewOpen(true);
      return;
    }
    if (sameClubIdentityBlocked) {
      setPreview(null);
      setPreviewPolicy(null);
      setPreviewError(
        "Die Vorschau ist gesperrt: Bitte ordne zuerst jeder bestätigten Mannschaft einen Verein zu.",
      );
      setPreviewOpen(true);
      return;
    }
    const nextPreview = buildChampionsLeagueAdminPreview({
      participants,
      matchesPerTeam: parseMatchesPerTeam(leagueMatchesPerTeam),
      knockoutCutoff: leagueCutoff,
      fields,
      timing: savedTournamentPlanTiming(tournament),
      restrictSameClub,
      clubByParticipantId,
    });
    setPreview(nextPreview);
    setPreviewPolicy(
      canRegenerateGroupSchedule({
        tournamentStatus: tournament.status,
        groupCount: groups.length,
        matches: matches.map((match) => ({
          phase: match.phase,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        })),
      }),
    );
    setPreviewOpen(true);
  }

  function closePreview() {
    if (pending) {
      return;
    }
    clearPreviewState();
  }

  async function run(task: () => Promise<{ error: string | null; notice?: string | null }>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await task();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    if (result.notice) {
      setNotice(result.notice);
    }
    invalidateOpenPreview();
    router.refresh();
    return true;
  }

  async function executeApply(confirmReplace: boolean) {
    if (!preview) {
      return;
    }
    if (preview.mode === "champions-league" && !championsLeagueApplyAllowed) {
      return;
    }
    if (preview.mode === "champions-league" && sameClubIdentityBlocked) {
      const message =
        "Die Übernahme ist gesperrt: Bitte ordne zuerst jeder bestätigten Mannschaft einen Verein zu.";
      setPreviewApplyLocked(true);
      setPreviewStatusMessage(message);
      setError(message);
      return;
    }
    if (preview.mode !== "champions-league" && !classicModeActive) {
      return;
    }
    const fingerprint = preview.inputFingerprint;
    const matchesPerTeam = parseMatchesPerTeam(leagueMatchesPerTeam);
    setPending(true);
    setError(null);
    setNotice(null);
    setPreviewStatusMessage(null);
    const result =
      preview.mode === "champions-league"
        ? await applyChampionsLeagueScheduleAction({
            tournamentId: tournament.id,
            previewFingerprint: fingerprint,
            matchesPerTeam: matchesPerTeam ?? Number.NaN,
            knockoutCutoff: leagueCutoff,
            restrictSameClub,
            confirmReplace,
          })
        : await applyTournamentPlanAction(tournament.id, fingerprint, confirmReplace);
    setPending(false);

    if (result.status === "success") {
      setNotice("Der Spielplan wurde erfolgreich übernommen.");
      clearPreviewState();
      router.refresh();
      return;
    }

    if (result.status === "stale_preview") {
      const message =
        result.error ??
        "Die Turnierdaten haben sich seit der Vorschau geändert. Bitte aktualisiere die Vorschau und prüfe den Spielplan erneut.";
      setPreviewApplyLocked(true);
      setPreviewStatusMessage(message);
      setError(message);
      return;
    }

    if (result.status === "confirmation_required") {
      setError(
        result.error ??
          "Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.",
      );
      return;
    }

    if (result.status === "blocked") {
      const message = result.error ?? "Der Spielplan darf in diesem Zustand nicht übernommen werden.";
      setPreviewApplyLocked(true);
      setPreviewStatusMessage(message);
      setError(message);
      return;
    }

    if (result.status === "persistence_error") {
      const message =
        result.error ??
        "Der Spielplan konnte nicht vollständig übernommen werden. Bitte lade den aktuellen Stand neu und prüfe den Spielplan.";
      setError(message);
      setPreviewApplyLocked(true);
      setPreviewStatusMessage(message);
      router.refresh();
      return;
    }

    // validation_error and any unexpected status
    setError(result.error ?? "Der Spielplan konnte nicht übernommen werden.");
  }

  async function executeGenerate(confirmReplace: boolean) {
    if (!classicModeActive || scheduleConfigLocked) {
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await generateTournamentScheduleAction(tournament.id, confirmReplace);
    setPending(false);

    if (result.status === "success") {
      if (result.notice) {
        setNotice(result.notice);
      }
      invalidateOpenPreview();
      router.refresh();
      return;
    }

    if (result.status === "confirmation_required") {
      setError(
        result.error ??
          "Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.",
      );
      return;
    }

    if (result.status === "blocked") {
      setError(result.error ?? "Der Spielplan darf in diesem Zustand nicht erzeugt werden.");
      return;
    }

    if (result.status === "persistence_error") {
      setError(
        result.error ??
          "Der Spielplan konnte nicht vollständig gespeichert werden. Bitte lade den aktuellen Stand neu und prüfe den Spielplan.",
      );
      router.refresh();
      return;
    }

    setError(result.error ?? "Der Spielplan konnte nicht erzeugt werden.");
  }

  function handleApplyRequest() {
    if (!preview || !previewPolicy || previewApplyLocked || pending) {
      return;
    }
    if (!previewIsApplicable(preview, previewPolicy, championsLeagueApplyAllowed)) {
      return;
    }
    if (previewPolicy.decision === "allowedWithConfirmation") {
      setConfirmApplyReplace(true);
      return;
    }
    if (previewPolicy.decision === "allowed") {
      void executeApply(false);
    }
  }

  function removeField(index: number) {
    if (!parametersEditable) {
      return;
    }
    setFieldNames((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addField() {
    if (!parametersEditable) {
      return;
    }
    setFieldNames((current) => [...current, fieldDisplayName(current.length)]);
  }

  function changeScheduleSetting(apply: () => void) {
    if (!parametersEditable) {
      return;
    }
    apply();
  }

  async function handleSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parametersEditable) {
      return;
    }
    await run(() =>
      saveScheduleSettingsAction(tournament.id, {
        matchDurationMinutes: duration,
        breakMinutes,
        minimumRestMinutes: restMinutes,
        lunchBreakStart: lunchStart,
        lunchBreakEnd: lunchEnd,
        fieldNames,
      }),
    );
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p className={`${adminCardShellClass} px-4 py-3.5 text-[14px] text-[#9a2b2b]`} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={`${adminCardShellClass} px-4 py-3.5 text-[14px] text-muted`}>{notice}</p>
      ) : null}

      {groupResultsLocked ? (
        <div
          className={`${adminCardShellClass} border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3.5`}
          role="status"
          aria-live="polite"
        >
          <p className="text-[14px] font-semibold text-ink">{GROUP_RESULT_LOCKED_MESSAGE}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {GROUP_RESULT_LOCK_CORRECTION_MESSAGE}
          </p>
        </div>
      ) : null}

      <AdminCard title="Spielparameter">
        <form onSubmit={handleSettings} className="grid gap-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Diese Spielparameter gelten für jeden Wettbewerbsmodus. Änderungen
            werden mit „Einstellungen speichern“ übernommen und fließen danach in
            jede neue Spielplanvorschau ein.
          </p>
          {parametersEditable ? null : (
            <p id="schedule-config-lock" className={`${adminCardShellClass} border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3 text-[13px] leading-relaxed text-ink`} role="status">
              {SCHEDULE_CONFIG_LOCKED_MESSAGE}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="duration" label="Spielzeit in Minuten">
              <TextInput
                id="duration"
                value={duration}
                disabled={!parametersEditable}
                onChange={(event) => changeScheduleSetting(() => setDuration(event.target.value))}
                className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
              />
            </Field>
            <Field id="break" label="Pause zwischen Spielen">
              <TextInput
                id="break"
                value={breakMinutes}
                disabled={!parametersEditable}
                onChange={(event) => changeScheduleSetting(() => setBreakMinutes(event.target.value))}
                className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
              />
            </Field>
            <Field id="rest" label="Mindestruhezeit">
              <TextInput
                id="rest"
                value={restMinutes}
                disabled={!parametersEditable}
                onChange={(event) => changeScheduleSetting(() => setRestMinutes(event.target.value))}
                className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
              />
            </Field>
            <Field id="lunch-start" label="Mittagspause von" optional>
              <TextInput
                id="lunch-start"
                type="time"
                value={lunchStart}
                disabled={!parametersEditable}
                onChange={(event) => changeScheduleSetting(() => setLunchStart(event.target.value))}
                className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
              />
            </Field>
            <Field id="lunch-end" label="Mittagspause bis" optional>
              <TextInput
                id="lunch-end"
                type="time"
                value={lunchEnd}
                disabled={!parametersEditable}
                onChange={(event) => changeScheduleSetting(() => setLunchEnd(event.target.value))}
                className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
              />
            </Field>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">Turnierstart</p>
              <p className="mt-2 flex h-11 items-center text-[15px] text-ink">
                {tournament.startTime ? `${tournament.startTime} Uhr` : "09:00 Uhr"}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">Feldnamen</p>
            {fieldNames.map((name, index) => (
              <div key={`field-${index}`} className="flex gap-2">
                <TextInput
                  value={name}
                  disabled={!parametersEditable}
                  onChange={(event) =>
                    changeScheduleSetting(() =>
                      setFieldNames((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                      ),
                    )
                  }
                  aria-label={`Feld ${index + 1}`}
                  className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
                />
                {fieldNames.length > 1 ? (
                  <button
                    type="button"
                    disabled={!parametersEditable}
                    aria-disabled={!parametersEditable}
                    aria-describedby={parametersEditable ? undefined : "schedule-config-lock"}
                    className="text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => removeField(index)}
                  >
                    Entfernen
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              disabled={!parametersEditable}
              aria-disabled={!parametersEditable}
              aria-describedby={parametersEditable ? undefined : "schedule-config-lock"}
              onClick={addField}
              className="justify-self-start text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Spielfeld hinzufügen
            </button>
          </div>

          <button
            type="submit"
            disabled={pending || !parametersEditable}
            aria-disabled={pending || !parametersEditable}
            aria-describedby={parametersEditable ? undefined : "schedule-config-lock"}
            className={`${adminPrimaryButtonClass} w-fit`}
          >
            Einstellungen speichern
          </button>
        </form>
      </AdminCard>

      <AdminCard title="Spielplan planen">
        <ChampionsLeagueScheduleFields
          mode={competitionMode}
          savedModeLabel={ADMIN_COMPETITION_MODE_LABELS[savedMode]}
          participantCount={leagueParticipantIds.length}
          participantNames={leagueParticipantIds.map((id) => teamLabels[id] ?? "Team")}
          matchesPerTeam={leagueMatchesPerTeam}
          knockoutCutoff={leagueCutoff}
          restrictSameClub={restrictSameClub}
          sameClubUnverifiedCount={sameClubUnverifiedCount}
          sameClubUnverifiedNames={sameClubUnverifiedNames}
          participantManagementHref={`/admin/turniere/${tournament.id}?bereich=teilnehmer#teilnehmer`}
          description={leagueDescription}
          onModeChange={selectCompetitionMode}
          onMatchesPerTeamChange={(value) => {
            setLeagueMatchesPerTeam(value);
            clearPreviewState();
          }}
          onCutoffChange={(cutoff) => {
            setLeagueCutoff(cutoff);
            clearPreviewState();
          }}
          onRestrictSameClubChange={(next) => {
            setRestrictSameClub(next);
            clearPreviewState();
          }}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || previewLoading || !previewAllowed}
            aria-describedby={sameClubIdentityBlocked ? "same-club-identity-block" : undefined}
            onClick={() => void handlePreview()}
            className={adminPrimaryButtonClass}
            aria-busy={previewLoading}
          >
            {previewLoading
              ? "Vorschau wird erstellt…"
              : previewOpen || previewApplyLocked
                ? "Vorschau aktualisieren"
                : "Vorschau erstellen"}
          </button>
          <button
            type="button"
            disabled={pending || previewLoading || !generateAllowed}
            onClick={() =>
              groupMatches.length > 0
                ? setConfirmGenerate(true)
                : void executeGenerate(false)
            }
            className={adminSecondaryButtonClass}
          >
            Direkt generieren
          </button>
          {groupMatches.length > 0 ? (
            <button
              type="button"
              disabled={pending || previewLoading || !classicModeActive || scheduleConfigLocked}
              onClick={requestClearSchedule}
              className={adminSecondaryButtonClass}
            >
              Spielplan löschen
            </button>
          ) : null}
          <a href={`/admin/turniere/${tournament.id}/spielplan/pdf`} className={adminSecondaryButtonClass}>
            Spielplan als PDF
          </a>
        </div>
        {competitionMode === "champions-league" ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Champions League verwendet eine gemeinsame Ligaphase (keine Gruppenphase).
            „Direkt generieren“ bleibt deaktiviert. Die geprüfte Vorschau wird mit
            „Spielplan übernehmen“ als Wettbewerbsmodus dauerhaft gespeichert.
          </p>
        ) : competitionMode === savedMode ? (
          <p className="mt-3 text-[13px] text-muted">
            Round-Robin innerhalb jeder Gruppe, ohne Hin- und Rückrunde. Uhrzeiten in deutscher Ortszeit.
            Die Vorschau basiert auf den aktuell gespeicherten Spielparametern.
          </p>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Gespeichert ist „{ADMIN_COMPETITION_MODE_LABELS[savedMode]}“. Der Wechsel
            zwischen Gruppenphase und Jeder gegen jeden ändert die Gruppenstruktur –
            bitte zuerst in der{" "}
            <a
              href={`/admin/turniere/${tournament.id}/gruppen`}
              className="font-semibold text-ink underline decoration-brand-blue/50 underline-offset-4 hover:text-brand-blue"
            >
              Gruppenverwaltung
            </a>{" "}
            anpassen. Champions League lässt sich dagegen direkt hier als Vorschau
            erstellen und übernehmen.
          </p>
        )}
        {classicModeActive ? (
          <p className="mt-1.5 text-[13px] text-muted">
            „Direkt generieren“ erstellt und speichert den Gruppenspielplan ohne Vorschau.
          </p>
        ) : null}
      </AdminCard>

      {previewOpen ? (
        previewError || !preview || !previewPolicy ? (
          <AdminCard title="Spielplan-Vorschau">
            <p className={`${adminCardShellClass} px-4 py-3.5 text-[14px] text-[#9a2b2b]`} role="alert">
              {previewError ?? "Die Vorschau konnte nicht geladen werden."}
            </p>
            <button
              type="button"
              onClick={closePreview}
              disabled={pending || previewLoading}
              className={`${adminSecondaryButtonClass} mt-4`}
            >
              Vorschau schließen
            </button>
          </AdminCard>
        ) : (
          <TournamentPlanPreviewPanel
            preview={preview}
            policy={previewPolicy}
            teamLabels={teamLabels}
            fieldLabels={Object.fromEntries(fields.map((field) => [field.id, field.name]))}
            onClose={closePreview}
            canApply={previewIsApplicable(preview, previewPolicy, championsLeagueApplyAllowed)}
            applyPending={pending}
            applyLocked={previewApplyLocked}
            statusMessage={previewStatusMessage}
            applyBlockReason={championsLeagueApplyBlockReasonText}
            onApply={handleApplyRequest}
          />
        )
      ) : null}

      <AdminCard title="Spiele">
        {groupMatches.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="grid gap-4">
            {groupMatches.map((match) => (
              <MatchEditor
                key={match.id}
                match={match}
                groups={groups}
                fields={fields}
                memberIdsByGroupId={memberIdsByGroupId}
                teamLabels={teamLabels}
                pending={pending}
                locked={!savedScheduleEditable}
                onSave={saveExistingMatch}
                onDelete={() => requestDeleteMatch(match.id)}
              />
            ))}
          </div>
        )}
      </AdminCard>

      <AddMatchForm
        tournamentDate={tournament.date}
        startTime={tournament.startTime}
        groups={groups}
        fields={fields}
        memberIdsByGroupId={memberIdsByGroupId}
        teamLabels={teamLabels}
        pending={pending}
        locked={!savedScheduleEditable}
        onSave={addMatch}
      />

      <ConfirmModal
        open={confirmGenerate}
        title="Spielplan direkt ersetzen?"
        confirmLabel="Direkt generieren"
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmGenerate(false)}
        onConfirm={() => {
          setConfirmGenerate(false);
          if (!classicModeActive || scheduleConfigLocked) {
            return;
          }
          void executeGenerate(true);
        }}
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Du generierst und speicherst den Spielplan direkt ohne Vorschau. Der
          bestehende Gruppenspielplan ohne Ergebnisse wird ersetzt.
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmApplyReplace}
        title="Bestehenden Spielplan ersetzen?"
        confirmLabel="Spielplan ersetzen"
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmApplyReplace(false)}
        onConfirm={() => {
          setConfirmApplyReplace(false);
          if (competitionMode !== "champions-league" && !classicModeActive) {
            return;
          }
          void executeApply(true);
        }}
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Der vorhandene Spielplan enthält noch keine Ergebnisse. Wenn du fortfährst,
          wird der bestehende Gruppenspielplan durch die aktuell geprüfte Vorschau
          ersetzt.
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmClear}
        title="Gesamten Gruppenspielplan löschen?"
        confirmLabel="Löschen"
        onCancel={() => setConfirmClear(false)}
        onConfirm={executeClearSchedule}
      />
      <ConfirmModal
        open={Boolean(deleteMatchId)}
        title="Dieses Spiel wirklich löschen?"
        confirmLabel="Löschen"
        onCancel={() => setDeleteMatchId(null)}
        onConfirm={executeDeleteMatch}
      />
    </div>
  );
}

function MatchEditor({
  match,
  groups,
  fields,
  memberIdsByGroupId,
  teamLabels,
  pending,
  locked,
  onSave,
  onDelete,
}: {
  match: TournamentMatchRecord;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
  pending: boolean;
  locked: boolean;
  onSave: (input: {
    matchId?: string;
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [groupId, setGroupId] = useState(match.groupId ?? groups[0]?.id ?? "");
  const [fieldId, setFieldId] = useState(match.fieldId ?? fields[0]?.id ?? "");
  const [homeId, setHomeId] = useState(matchSideParticipantId(match, "home") ?? "");
  const [awayId, setAwayId] = useState(matchSideParticipantId(match, "away") ?? "");
  const [scheduledAt, setScheduledAt] = useState(isoToDatetimeLocal(match.scheduledAt));
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const teams = Array.from(
    new Set([...(memberIdsByGroupId[groupId] ?? []), homeId, awayId].filter(Boolean)),
  );
  const controlsDisabled = pending || locked;

  return (
    <form
      className="grid gap-3 border border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) {
          return;
        }
        void onSave({
          matchId: match.id,
          groupId,
          fieldId,
          homeApplicationId: homeId,
          awayApplicationId: awayId,
          scheduledAt,
          status,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectInput
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          aria-label="Gruppe"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={fieldId}
          onChange={(event) => setFieldId(event.target.value)}
          aria-label="Spielfeld"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </SelectInput>
        <TextInput
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          aria-label="Uhrzeit"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        />
        <SelectInput
          value={homeId}
          onChange={(event) => setHomeId(event.target.value)}
          aria-label="Heimteam"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={awayId}
          onChange={(event) => setAwayId(event.target.value)}
          aria-label="Auswärtsteam"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={status}
          onChange={(event) => setStatus(event.target.value as MatchStatus)}
          aria-label="Status"
          disabled={controlsDisabled}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {MATCH_STATUSES.map((item) => (
            <option key={item} value={item}>
              {statusLabel[item]}
            </option>
          ))}
        </SelectInput>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={controlsDisabled}
          aria-disabled={controlsDisabled}
          className={adminPrimaryButtonClass}
        >
          Spiel speichern
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          aria-disabled={controlsDisabled}
          onClick={() => {
            if (locked) {
              return;
            }
            onDelete();
          }}
          className="inline-flex h-10 items-center text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase disabled:cursor-not-allowed disabled:opacity-60"
        >
          Löschen
        </button>
      </div>
    </form>
  );
}

function AddMatchForm({
  tournamentDate,
  startTime,
  groups,
  fields,
  memberIdsByGroupId,
  teamLabels,
  pending,
  locked,
  onSave,
}: {
  tournamentDate: string;
  startTime: string | null;
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  teamLabels: Record<string, string>;
  pending: boolean;
  locked: boolean;
  onSave: (input: {
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  }) => Promise<boolean>;
}) {
  const firstGroup = groups[0]?.id ?? "";
  const [groupId, setGroupId] = useState(firstGroup);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const teams = memberIdsByGroupId[groupId] ?? [];
  const [homeId, setHomeId] = useState(teams[0] ?? "");
  const [awayId, setAwayId] = useState(teams[1] ?? "");
  const defaultTime = `${tournamentDate}T${(startTime ?? "09:00").slice(0, 5)}`;
  const [scheduledAt, setScheduledAt] = useState(defaultTime);
  const controlsDisabled = pending || locked || teams.length < 2;

  if (groups.length === 0) {
    return null;
  }

  return (
    <AdminCard title="Spiel hinzufügen">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (locked) {
            return;
          }
          void onSave({
            groupId,
            fieldId,
            homeApplicationId: homeId,
            awayApplicationId: awayId,
            scheduledAt,
            status: "scheduled",
          });
        }}
      >
        <SelectInput
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          disabled={pending || locked}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={fieldId}
          onChange={(event) => setFieldId(event.target.value)}
          disabled={pending || locked}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </SelectInput>
        <TextInput
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          disabled={pending || locked}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        />
        <SelectInput
          value={homeId}
          onChange={(event) => setHomeId(event.target.value)}
          disabled={pending || locked}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={awayId}
          onChange={(event) => setAwayId(event.target.value)}
          disabled={pending || locked}
          className="disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70"
        >
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabels[id] ?? id}
            </option>
          ))}
        </SelectInput>
        <button
          type="submit"
          disabled={controlsDisabled}
          aria-disabled={controlsDisabled}
          className={adminPrimaryButtonClass}
        >
          Spiel hinzufügen
        </button>
      </form>
    </AdminCard>
  );
}
