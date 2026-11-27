"use client";

import {
  AdminCard,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSectionTitleClass,
} from "@/components/admin/AdminPanel";
import { SelectInput, TextInput } from "@/components/apply/FormControls";
import { datetimeLocalToIso, formatBerlinClock, isoToDatetimeLocal } from "@/lib/schedule/datetime";
import type { EditablePreviewMatch, ValidateEditedLeaguePlanResult } from "@/lib/schedule/league-preview-edit";
import { previewParticipantKey } from "@/lib/schedule/plan-preview";
import type { RegenerationPolicyResult, TournamentPlanPreview } from "@/lib/schedule/plan-preview";

type EditableLeaguePreviewPanelProps = {
  preview: TournamentPlanPreview;
  plan: EditablePreviewMatch[];
  validation: ValidateEditedLeaguePlanResult;
  teamLabels: Record<string, string>;
  participantIds: string[];
  fields: Array<{ id: string; name: string }>;
  policy: RegenerationPolicyResult;
  canApply: boolean;
  applyPending: boolean;
  applyLocked: boolean;
  statusMessage: string | null;
  applyBlockReason: string | null;
  dirty: boolean;
  onMove: (key: string, direction: "up" | "down") => void;
  onSetField: (key: string, fieldId: string) => void;
  onSetKickoff: (key: string, iso: string | null) => void;
  onSetParticipant: (key: string, side: "home" | "away", participantId: string) => void;
  onRecomputeTimes: () => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
};

export function EditableLeaguePreviewPanel({
  preview,
  plan,
  validation,
  teamLabels,
  participantIds,
  fields,
  policy,
  canApply,
  applyPending,
  applyLocked,
  statusMessage,
  applyBlockReason,
  dirty,
  onMove,
  onSetField,
  onSetKickoff,
  onSetParticipant,
  onRecomputeTimes,
  onReset,
  onApply,
  onClose,
}: EditableLeaguePreviewPanelProps) {
  const invalid = new Set(validation.invalidMatchKeys);
  const restFlagged = new Set(validation.restWarningMatchKeys);
  const blockingIssues = validation.issues.filter((issue) => issue.blocking);
  const restIssues = validation.issues.filter((issue) => !issue.blocking);
  const ordered = plan.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const expected = preview.summary.expectedLeagueMatchCount ?? ordered.length;
  const showApply = canApply && !applyLocked;

  return (
    <AdminCard title="Spielplan-Vorschau · Ligaphase (bearbeitbar)">
      <div className="grid min-w-0 gap-5">
        <p className="text-[13px] leading-relaxed text-muted">
          Bearbeite die Ligaphase vor der Übernahme: Reihenfolge ändern,
          Anstoßzeit und Spielfeld anpassen oder die Zeiten neu berechnen lassen.
          Jede Änderung wird sofort geprüft. Erst „Spielplan übernehmen“ speichert
          den Stand. Nichts am gespeicherten Spielplan ändert sich vorher.
        </p>

        <div
          className={`${adminCardShellClass} px-4 py-3.5 text-[14px] ${
            policy.decision === "allowedWithConfirmation"
              ? "border-[#e2c48a] bg-[#fff8e8] text-[#7a5a1e]"
              : "border-line bg-surface/60 text-muted"
          }`}
          role="status"
        >
          <p className="font-semibold tracking-[0.04em] uppercase">
            {ordered.length} / {expected} Ligabegegnungen · Top{" "}
            {preview.summary.knockoutCutoff ?? "?"}
          </p>
          {policy.state === "SCHEDULE_NO_RESULTS" ? (
            <p className="mt-1.5 text-[13px] leading-relaxed">
              Es besteht bereits ein Spielplan ohne Ergebnisse. Die Übernahme ersetzt ihn
              nach ausdrücklicher Bestätigung.
            </p>
          ) : null}
        </div>

        {statusMessage ? (
          <p className={`${adminCardShellClass} px-4 py-3.5 text-[14px] text-[#9a2b2b]`} role="alert">
            {statusMessage}
          </p>
        ) : null}

        {blockingIssues.length > 0 ? (
          <section aria-labelledby="edit-issues-heading">
            <h3 id="edit-issues-heading" className={adminSectionTitleClass}>
              Zu beheben
            </h3>
            <ul className="mt-3 grid gap-2" role="list">
              {blockingIssues.map((issue, index) => (
                <li
                  key={`${issue.code}-${index}`}
                  className={`${adminCardShellClass} border-[#d9b0b0] bg-[#fff5f5] px-3.5 py-3 text-[13px] text-[#9a2b2b]`}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {restIssues.length > 0 ? (
          <p className={`${adminCardShellClass} border-[#e2c48a] bg-[#fff8e8] px-3.5 py-3 text-[13px] leading-relaxed text-[#7a5a1e]`} role="status">
            Hinweis: Bei {restIssues.length} Begegnungspaar
            {restIssues.length === 1 ? "" : "en"} wird die Mindestruhezeit
            unterschritten. Die Übernahme ist weiterhin möglich.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onRecomputeTimes} disabled={applyPending} className={adminSecondaryButtonClass}>
            Zeiten neu berechnen
          </button>
          <button type="button" onClick={onReset} disabled={applyPending || !dirty} className={adminSecondaryButtonClass}>
            Vorschau zurücksetzen
          </button>
        </div>

        <section aria-labelledby="edit-table-heading" className="min-w-0">
          <h3 id="edit-table-heading" className={adminSectionTitleClass}>
            Geplante Ligabegegnungen
          </h3>
          <div className="mt-3 max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="px-3 py-2.5">#</th>
                  <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Reihenfolge</th>
                  <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Anstoß</th>
                  <th scope="col" className="px-3 py-2.5">Feld</th>
                  <th scope="col" className="px-3 py-2.5">Heim</th>
                  <th scope="col" className="px-3 py-2.5">Gast</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((match, index) => {
                  const rowInvalid = invalid.has(match.key);
                  const rowRest = restFlagged.has(match.key);
                  return (
                    <tr
                      key={match.key}
                      className={`border-b border-line/70 last:border-b-0 ${
                        rowInvalid ? "bg-[#fff5f5]" : rowRest ? "bg-[#fff8e8]" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 text-muted">{index + 1}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            aria-label="Nach oben"
                            disabled={applyPending || index === 0}
                            onClick={() => onMove(match.key, "up")}
                            className="inline-flex h-8 w-8 items-center justify-center border border-line text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="Nach unten"
                            disabled={applyPending || index === ordered.length - 1}
                            onClick={() => onMove(match.key, "down")}
                            className="inline-flex h-8 w-8 items-center justify-center border border-line text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <TextInput
                          type="datetime-local"
                          aria-label={`Anstoßzeit Spiel ${index + 1}`}
                          value={isoToDatetimeLocal(match.scheduledAt)}
                          disabled={applyPending}
                          onChange={(event) =>
                            onSetKickoff(
                              match.key,
                              event.target.value ? datetimeLocalToIso(event.target.value) : null,
                            )
                          }
                        />
                        <span className="mt-1 block text-[11px] text-muted">
                          {match.scheduledAt ? formatBerlinClock(match.scheduledAt) : "Nicht eingeplant"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <SelectInput
                          aria-label={`Spielfeld Spiel ${index + 1}`}
                          value={match.fieldId ?? ""}
                          disabled={applyPending}
                          onChange={(event) => onSetField(match.key, event.target.value)}
                        >
                          <option value="">—</option>
                          {fields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.name}
                            </option>
                          ))}
                        </SelectInput>
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        <SelectInput
                          aria-label={`Heimteam Vorschau Spiel ${index + 1}`}
                          value={previewParticipantKey(match.home) ?? ""}
                          disabled={applyPending}
                          onChange={(event) => onSetParticipant(match.key, "home", event.target.value)}
                        >
                          {participantIds.map((participantId) => (
                            <option key={participantId} value={participantId}>
                              {teamLabels[participantId] ?? "Unbenannte Mannschaft"}
                            </option>
                          ))}
                        </SelectInput>
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        <SelectInput
                          aria-label={`Auswärtsteam Vorschau Spiel ${index + 1}`}
                          value={previewParticipantKey(match.away) ?? ""}
                          disabled={applyPending}
                          onChange={(event) => onSetParticipant(match.key, "away", event.target.value)}
                        >
                          {participantIds.map((participantId) => (
                            <option key={participantId} value={participantId}>
                              {teamLabels[participantId] ?? "Unbenannte Mannschaft"}
                            </option>
                          ))}
                        </SelectInput>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          {showApply ? (
            <button
              type="button"
              onClick={onApply}
              disabled={applyPending}
              className={adminPrimaryButtonClass}
              aria-busy={applyPending}
            >
              {applyPending ? "Spielplan wird übernommen…" : "Spielplan übernehmen"}
            </button>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              „Spielplan übernehmen“ ist gesperrt
              {applyBlockReason ? `: ${applyBlockReason}` : blockingIssues[0] ? `: ${blockingIssues[0].message}` : "."}
            </p>
          )}
          <button type="button" onClick={onClose} disabled={applyPending} className={adminSecondaryButtonClass}>
            Vorschau schließen
          </button>
        </div>
      </div>
    </AdminCard>
  );
}
