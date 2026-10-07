"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminCard,
  AdminInfo,
  adminCardShellClass,
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminMobileCardClass,
  adminPrimaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  confirmAllDetectedExternalTeamsAction,
  confirmExternalTeamsAction,
  rejectExternalTeamsAction,
  type ExternalTeamAdminRow,
} from "@/lib/db/mein-turnierplan-participants-actions";
import {
  removeParticipantFromGroupAction,
  removeTournamentParticipantAction,
} from "@/lib/db/tournament-participant-membership-actions";
import { countDetectedExternalTeams } from "@/lib/mein-turnierplan-participants";

type ExternalTeamsParticipationPanelProps = {
  tournamentId: string;
  teams: ExternalTeamAdminRow[];
  confirmedParticipantCount: number;
  maxTeams: number | null;
};

type ConfirmState =
  | {
      kind: "remove-group";
      team: ExternalTeamAdminRow;
    }
  | {
      kind: "remove-participant";
      team: ExternalTeamAdminRow;
    }
  | null;

function statusLabel(status: ExternalTeamAdminRow["participationStatus"]) {
  switch (status) {
    case "confirmed":
      return "Bestätigt";
    case "rejected":
      return "Abgelehnt";
    default:
      return "Erkannt";
  }
}

export function ExternalTeamsParticipationPanel({
  tournamentId,
  teams,
  confirmedParticipantCount,
  maxTeams,
}: ExternalTeamsParticipationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // Active teams, plus inactive/rejected rows that still have a stale group assignment.
  const visibleTeams = useMemo(
    () => teams.filter((team) => team.externalActive || Boolean(team.groupName)),
    [teams],
  );
  const activeTeams = useMemo(
    () => visibleTeams.filter((team) => team.externalActive),
    [visibleTeams],
  );
  const detectedCount = countDetectedExternalTeams(activeTeams);
  const maxLabel = maxTeams == null ? "—" : String(maxTeams);

  function runAction(action: () => Promise<{ error: string | null; notice: string | null }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.notice);
      router.refresh();
    });
  }

  if (visibleTeams.length === 0) {
    return null;
  }

  return (
    <AdminCard title="MeinTurnierplan-Teilnehmer">
      <p className="text-[14px] leading-6 text-muted">
        Externe Teams aus MeinTurnierplan werden ohne Fake-Bewerbungen geführt. Bestätigte
        Teams zählen als Turnierteilnehmer.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <AdminInfo
          label="Erkannt"
          value={`${activeTeams.length} Teams · ${detectedCount} offen`}
        />
        <AdminInfo
          label="Aktuelle Teilnehmer"
          value={`${confirmedParticipantCount} / ${maxLabel}`}
        />
        <AdminInfo label="Quelle" value="MeinTurnierplan" />
      </dl>

      {detectedCount > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              runAction(() => confirmAllDetectedExternalTeamsAction(tournamentId))
            }
            className={adminPrimaryButtonClass}
          >
            {pending ? "Bestätige…" : "Alle MeinTurnierplan-Teams bestätigen"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={`mt-4 ${adminCardShellClass} px-4 py-3 text-[14px] text-brand-red`}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-4 ${adminCardShellClass} px-4 py-3 text-[14px] text-ink`}>{notice}</p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {visibleTeams.map((team) => {
          const isConfirmed = team.participationStatus === "confirmed" && team.externalActive;
          const isDetected = team.participationStatus === "detected" && team.externalActive;
          const isStaleGrouped =
            Boolean(team.groupName) &&
            (team.participationStatus === "rejected" || !team.externalActive);
          const showRemoveGroup = Boolean(team.groupName) && (isConfirmed || isStaleGrouped);
          const showRemoveParticipant = isConfirmed;
          const showAblehnen = isDetected;

          return (
            <article key={team.id} className={adminMobileCardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base font-bold tracking-wide text-ink uppercase">
                    {team.name}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">Quelle: MeinTurnierplan</p>
                </div>
                <p className={`${adminStatusBadgeClass} bg-surface text-ink`}>
                  {!team.externalActive ? "Inaktiv" : statusLabel(team.participationStatus)}
                </p>
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <AdminInfo label="Gruppe" value={team.groupName ?? "—"} />
                <AdminInfo label="Externe ID" value={team.externalId} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {team.participationStatus !== "confirmed" && team.externalActive ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      runAction(() =>
                        confirmExternalTeamsAction({
                          tournamentId,
                          teamIds: [team.id],
                        }),
                      )
                    }
                    className={adminCompactPrimaryButtonClass}
                  >
                    Teilnahme bestätigen
                  </button>
                ) : null}
                {showAblehnen ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      runAction(() =>
                        rejectExternalTeamsAction({
                          tournamentId,
                          teamIds: [team.id],
                        }),
                      )
                    }
                    className={adminCompactSecondaryButtonClass}
                  >
                    Ablehnen
                  </button>
                ) : null}
                {showRemoveGroup ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirm({ kind: "remove-group", team })}
                    className={adminCompactSecondaryButtonClass}
                  >
                    Aus Gruppe entfernen
                  </button>
                ) : null}
                {showRemoveParticipant ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirm({ kind: "remove-participant", team })}
                    className={adminCompactSecondaryButtonClass}
                  >
                    Teilnehmer entfernen
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <ConfirmModal
        open={confirm?.kind === "remove-group"}
        title={
          confirm?.kind === "remove-group"
            ? `${confirm.team.name} aus ${confirm.team.groupName ?? "Gruppe"} entfernen?`
            : ""
        }
        confirmLabel="Aus Gruppe entfernen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const team = confirm?.kind === "remove-group" ? confirm.team : null;
          setConfirm(null);
          if (!team) {
            return;
          }
          runAction(() =>
            removeParticipantFromGroupAction({
              tournamentId,
              externalTeamId: team.id,
            }),
          );
        }}
      >
        <p className="text-[14px] leading-6 text-muted">
          {confirm?.kind === "remove-group" &&
          (confirm.team.participationStatus === "rejected" || !confirm.team.externalActive)
            ? "Die veraltete Gruppenzuordnung wird entfernt. Der Teilnahmestatus bleibt unverändert."
            : "Das Team bleibt Turnierteilnehmer und kann anschließend einer anderen Gruppe zugeordnet werden."}
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={confirm?.kind === "remove-participant"}
        title={
          confirm?.kind === "remove-participant"
            ? `${confirm.team.name} als Teilnehmer entfernen?`
            : ""
        }
        confirmLabel="Teilnehmer entfernen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const team = confirm?.kind === "remove-participant" ? confirm.team : null;
          setConfirm(null);
          if (!team) {
            return;
          }
          runAction(() =>
            removeTournamentParticipantAction({
              tournamentId,
              externalTeamId: team.id,
            }),
          );
        }}
      >
        <p className="text-[14px] leading-6 text-muted">
          Das Team nimmt anschließend nicht mehr am Turnier teil und wird aus seiner Gruppe
          entfernt.
        </p>
      </ConfirmModal>
    </AdminCard>
  );
}
