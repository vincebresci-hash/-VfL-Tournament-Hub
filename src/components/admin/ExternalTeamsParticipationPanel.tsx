"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminCard, AdminInfo } from "@/components/admin/AdminPanel";
import {
  confirmAllDetectedExternalTeamsAction,
  confirmExternalTeamsAction,
  rejectExternalTeamsAction,
  type ExternalTeamAdminRow,
} from "@/lib/db/mein-turnierplan-participants-actions";
import { countDetectedExternalTeams } from "@/lib/mein-turnierplan-participants";

type ExternalTeamsParticipationPanelProps = {
  tournamentId: string;
  teams: ExternalTeamAdminRow[];
  confirmedParticipantCount: number;
  maxTeams: number | null;
};

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

  const activeTeams = useMemo(
    () => teams.filter((team) => team.externalActive),
    [teams],
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

  if (activeTeams.length === 0) {
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
            className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-50"
          >
            {pending ? "Bestätige…" : "Alle MeinTurnierplan-Teams bestätigen"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 border border-line bg-white px-4 py-3 text-[14px] text-brand-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 border border-line bg-white px-4 py-3 text-[14px] text-ink">{notice}</p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {activeTeams.map((team) => (
          <article key={team.id} className="border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-base font-bold tracking-wide text-ink uppercase">
                  {team.name}
                </p>
                <p className="mt-1 text-[13px] text-muted">Quelle: MeinTurnierplan</p>
              </div>
              <p className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">
                {statusLabel(team.participationStatus)}
              </p>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <AdminInfo label="Gruppe" value={team.groupName ?? "—"} />
              <AdminInfo label="Externe ID" value={team.externalId} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {team.participationStatus !== "confirmed" ? (
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
                  className="inline-flex h-10 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 disabled:opacity-50"
                >
                  Teilnahme bestätigen
                </button>
              ) : null}
              {team.participationStatus !== "rejected" ? (
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
                  className="inline-flex h-10 items-center border border-line px-3 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 disabled:opacity-50"
                >
                  Ablehnen
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </AdminCard>
  );
}
