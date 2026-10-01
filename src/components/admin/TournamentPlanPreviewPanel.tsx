"use client";

import {
  AdminCard,
  adminCardShellClass,
  adminSecondaryButtonClass,
  adminSectionTitleClass,
} from "@/components/admin/AdminPanel";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import type {
  RegenerationPolicyResult,
  TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";

type TournamentPlanPreviewPanelProps = {
  preview: TournamentPlanPreview;
  policy: RegenerationPolicyResult;
  teamLabels: Record<string, string>;
  fieldLabels: Record<string, string>;
  onClose: () => void;
};

function participantLabel(
  applicationId: string | null,
  externalTeamId: string | null,
  teamLabels: Record<string, string>,
) {
  const id = applicationId ?? externalTeamId;
  if (!id) {
    return "Unbekannt";
  }
  return teamLabels[id] ?? "Team";
}

function policyTone(policy: RegenerationPolicyResult) {
  if (policy.decision === "blocked") {
    return "border-[#d9b0b0] bg-[#fff5f5] text-[#9a2b2b]";
  }
  if (policy.decision === "allowedWithConfirmation") {
    return "border-[#e2c48a] bg-[#fff8e8] text-[#7a5a1e]";
  }
  return "border-line bg-surface/60 text-muted";
}

function policyHeadline(policy: RegenerationPolicyResult) {
  switch (policy.state) {
    case "EMPTY":
      return "Kein Spielplan vorhanden";
    case "GROUPS_ONLY":
      return "Gruppen vorhanden — Generierung möglich";
    case "SCHEDULE_NO_RESULTS":
      return "Bestehender Spielplan ohne Ergebnisse";
    case "RESULTS_EXIST":
      return "Ergebnisse vorhanden — Neugenerierung gesperrt";
    case "LIVE":
      return "Live-Spiele — Neugenerierung gesperrt";
    case "KO_STARTED":
      return "KO-Phase vorhanden — Neugenerierung gesperrt";
    case "COMPLETED":
      return "Turnier abgeschlossen — Neugenerierung gesperrt";
    case "AMBIGUOUS":
      return "Unklarer Stand — Neugenerierung gesperrt";
    default:
      return "Regenerierungsstatus";
  }
}

export function TournamentPlanPreviewPanel({
  preview,
  policy,
  teamLabels,
  fieldLabels,
  onClose,
}: TournamentPlanPreviewPanelProps) {
  const summaryItems = [
    { label: "Teilnehmer", value: String(preview.summary.participantCount) },
    { label: "Gruppen", value: String(preview.summary.groupCount) },
    { label: "Spiele", value: String(preview.summary.groupMatchCount) },
    { label: "Felder", value: String(preview.summary.fieldCount) },
    { label: "Erster Anstoß", value: formatBerlinClock(preview.summary.firstKickoff) },
    {
      label: "Letzter Anstoß",
      value: formatBerlinClock(preview.summary.estimatedLastKickoff),
    },
    {
      label: "Voraussichtliches Ende",
      value: formatBerlinClock(preview.summary.estimatedEnd),
    },
  ];

  return (
    <AdminCard title="Spielplan-Vorschau">
      <div className="grid gap-5">
        <p className="text-[13px] text-muted">
          Die Vorschau basiert auf den aktuell gespeicherten Turniereinstellungen. Es
          wird nichts gespeichert und kein bestehender Spielplan verändert.
        </p>

        <div
          className={`${adminCardShellClass} px-4 py-3.5 text-[14px] ${policyTone(policy)}`}
          role="status"
        >
          <p className="font-semibold tracking-[0.04em] uppercase">{policyHeadline(policy)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed">{policy.reason}</p>
          {policy.state === "SCHEDULE_NO_RESULTS" ? (
            <p className="mt-2 text-[13px] leading-relaxed">
              Es besteht bereits ein Spielplan ohne Ergebnisse. Eine spätere
              Neugenerierung würde diesen Spielplan ersetzen.
            </p>
          ) : null}
          {policy.decision === "blocked" ? (
            <p className="mt-2 text-[13px] leading-relaxed">
              Die Vorschau ist nur zur Information. Der bestehende Spielplan darf in
              diesem Zustand nicht neu generiert werden.
            </p>
          ) : null}
        </div>

        <section aria-labelledby="preview-summary-heading">
          <h3 id="preview-summary-heading" className={adminSectionTitleClass}>
            Zusammenfassung
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaryItems.map((item) => (
              <div key={item.label} className={`${adminCardShellClass} px-3.5 py-3`}>
                <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1.5 text-[15px] text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="preview-groups-heading">
          <h3 id="preview-groups-heading" className={adminSectionTitleClass}>
            Gruppen
          </h3>
          {preview.groups.length === 0 ? (
            <p className="mt-3 text-[14px] text-muted">Keine Gruppen in der Vorschau.</p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {preview.groups.map((group) => {
                const members = preview.memberships.filter(
                  (membership) => membership.groupKey === group.key,
                );
                return (
                  <li key={group.key} className={`${adminCardShellClass} px-3.5 py-3`}>
                    <p className="text-[13px] font-semibold text-ink">{group.name}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">
                      {members.length === 0
                        ? "Keine Teams"
                        : members
                            .map((membership) =>
                              participantLabel(
                                membership.participant.applicationId,
                                membership.participant.externalTeamId,
                                teamLabels,
                              ),
                            )
                            .join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {preview.warnings.length > 0 ? (
          <section aria-labelledby="preview-warnings-heading">
            <h3 id="preview-warnings-heading" className={adminSectionTitleClass}>
              Hinweise
            </h3>
            <ul className="mt-3 grid gap-2" role="list">
              {preview.warnings.map((warning, index) => (
                <li
                  key={`${warning.code}-${index}`}
                  className={`${adminCardShellClass} border-[#e2c48a] bg-[#fff8e8] px-3.5 py-3 text-[13px] text-[#7a5a1e]`}
                >
                  <span className="sr-only">Hinweis: </span>
                  {warning.message}
                  {warning.code === "NO_FIELDS" ? (
                    <span className="mt-1 block">
                      Ohne gespeichertes Spielfeld kann die Vorschau keinen normalen
                      Zeitplan erzeugen. Bitte zuerst unter Spielparameter ein Feld
                      speichern.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="preview-schedule-heading">
          <h3 id="preview-schedule-heading" className={adminSectionTitleClass}>
            Geplante Spiele
          </h3>
          {preview.matches.length === 0 ? (
            <p className="mt-3 text-[14px] text-muted">
              Keine Gruppenspiele in der Vorschau.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                      Uhrzeit
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                      Feld
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Heim
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Gast
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Gruppe
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Hinweis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matches.map((match) => {
                    const groupName =
                      preview.groups.find((group) => group.key === match.groupKey)?.name ??
                      "—";
                    const fieldName = match.fieldId
                      ? (fieldLabels[match.fieldId] ?? "Feld")
                      : "—";
                    return (
                      <tr key={match.key} className="border-b border-line/70 last:border-b-0">
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                          {formatBerlinClock(match.scheduledAt)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink">{fieldName}</td>
                        <td className="px-3 py-2.5 text-ink">
                          {participantLabel(
                            match.home.applicationId,
                            match.home.externalTeamId,
                            teamLabels,
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink">
                          {participantLabel(
                            match.away.applicationId,
                            match.away.externalTeamId,
                            teamLabels,
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink">{groupName}</td>
                        <td className="px-3 py-2.5 text-muted">
                          {match.restWarning ? "Mindestruhezeit" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onClose} className={adminSecondaryButtonClass}>
            Vorschau schließen
          </button>
        </div>
      </div>
    </AdminCard>
  );
}
