"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AdminCard,
  adminCardShellClass,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { SelectInput } from "@/components/apply/FormControls";
import { updateApplicationParticipantClubAction } from "@/lib/db/tournament-participants-actions";
import type { ClubSuggestion } from "@/lib/schedule/club-assignment-suggest";

export type ClubAssignmentEntry = {
  participantId: string;
  teamName: string;
  /** Present for accepted-application participants (assignable inline). */
  applicationId: string | null;
  suggestion: ClubSuggestion | null;
};

type ClubAssignmentPanelProps = {
  tournamentId: string;
  entries: ClubAssignmentEntry[];
  clubs: Array<{ id: string; name: string }>;
  participantManagementHref: string;
  disabled: boolean;
};

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "Sicher",
  strong: "Sehr ähnlich – bestätigen",
  weak: "Möglich – prüfen",
  none: "Kein Vorschlag",
};

export function ClubAssignmentPanel({
  tournamentId,
  entries,
  clubs,
  participantManagementHref,
  disabled,
}: ClubAssignmentPanelProps) {
  const router = useRouter();
  // The pre-selected club id per participant. Only an "exact" (safe) suggestion
  // is preselected; weaker suggestions start empty and require a manual choice.
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map((entry) => [
        entry.participantId,
        entry.suggestion?.safe ? (entry.suggestion.suggestedClubId ?? "") : "",
      ]),
    ),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowNotice, setRowNotice] = useState<Record<string, string>>({});

  if (entries.length === 0) {
    return null;
  }

  async function assign(entry: ClubAssignmentEntry) {
    if (!entry.applicationId) {
      return;
    }
    const clubId = selected[entry.participantId] || null;
    if (!clubId) {
      setRowError((current) => ({ ...current, [entry.participantId]: "Bitte zuerst einen Verein auswählen." }));
      return;
    }
    setPendingId(entry.participantId);
    setRowError((current) => ({ ...current, [entry.participantId]: "" }));
    setRowNotice((current) => ({ ...current, [entry.participantId]: "" }));
    const result = await updateApplicationParticipantClubAction({
      tournamentId,
      applicationId: entry.applicationId,
      clubId,
    });
    setPendingId(null);
    if (result.error) {
      setRowError((current) => ({ ...current, [entry.participantId]: result.error as string }));
      return;
    }
    setRowNotice((current) => ({
      ...current,
      [entry.participantId]: result.notice ?? "Vereinszuordnung gespeichert.",
    }));
    router.refresh();
  }

  return (
    <AdminCard title="Vereinszuordnung">
      <div className="grid gap-4">
        <p className="text-[13px] leading-relaxed text-muted">
          {entries.length}{" "}
          {entries.length === 1 ? "Mannschaft hat" : "Mannschaften haben"} noch keine
          Vereinszuordnung. Ordne sie hier direkt zu. Vorschläge beruhen auf den
          Mannschafts- und Vereinsnamen; unsichere Vorschläge müssen manuell bestätigt
          werden. Es wird nie automatisch ein Verein gesetzt.
        </p>

        <ul className="grid gap-3" role="list">
          {entries.map((entry) => {
            const suggestion = entry.suggestion;
            const assignable = Boolean(entry.applicationId);
            return (
              <li key={entry.participantId} className={`${adminCardShellClass} grid gap-2 px-3.5 py-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">{entry.teamName}</span>
                  {suggestion && suggestion.confidence !== "none" ? (
                    <span
                      className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${
                        suggestion.safe ? "text-[#1f7a4d]" : "text-[#7a5a1e]"
                      }`}
                    >
                      {CONFIDENCE_LABEL[suggestion.confidence]}
                      {suggestion.suggestedClubName ? `: ${suggestion.suggestedClubName}` : ""}
                    </span>
                  ) : null}
                </div>

                {assignable ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <SelectInput
                      aria-label={`Verein für ${entry.teamName}`}
                      value={selected[entry.participantId] ?? ""}
                      disabled={disabled || pendingId === entry.participantId}
                      onChange={(event) =>
                        setSelected((current) => ({ ...current, [entry.participantId]: event.target.value }))
                      }
                      className="min-w-[14rem]"
                    >
                      <option value="">Verein wählen…</option>
                      {clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.name}
                        </option>
                      ))}
                    </SelectInput>
                    <button
                      type="button"
                      disabled={disabled || pendingId === entry.participantId}
                      onClick={() => void assign(entry)}
                      className={adminPrimaryButtonClass}
                    >
                      {pendingId === entry.participantId ? "Wird gespeichert…" : "Zuordnen"}
                    </button>
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted">
                    Externe Mannschaft: bitte in der{" "}
                    <a
                      href={participantManagementHref}
                      className="font-semibold text-ink underline decoration-brand-blue/50 underline-offset-4 hover:text-brand-blue"
                    >
                      Teilnehmerverwaltung
                    </a>{" "}
                    zuordnen.
                  </p>
                )}

                {rowError[entry.participantId] ? (
                  <p className="text-[13px] text-[#9a2b2b]" role="alert">
                    {rowError[entry.participantId]}
                  </p>
                ) : null}
                {rowNotice[entry.participantId] ? (
                  <p className="text-[13px] text-[#1f7a4d]">{rowNotice[entry.participantId]}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </AdminCard>
  );
}
