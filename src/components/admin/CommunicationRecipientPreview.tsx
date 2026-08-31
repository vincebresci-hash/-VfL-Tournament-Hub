"use client";

import { summarizeRecipientPreview } from "@/lib/communications/recipient-picker";
import type { CommunicationRecipientPreviewRow } from "@/lib/communications/recipient-picker";

type CommunicationRecipientPreviewProps = {
  recipients: CommunicationRecipientPreviewRow[];
  selectedTeamCount?: number | null;
};

export function CommunicationRecipientPreview({
  recipients,
  selectedTeamCount = null,
}: CommunicationRecipientPreviewProps) {
  const summary = summarizeRecipientPreview(recipients, selectedTeamCount);

  return (
    <div className="mt-6 border border-line bg-surface px-4 py-4">
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        Versand-Zusammenfassung
      </p>

      {summary.actualRecipientCount === 0 ? (
        <p className="mt-3 text-[14px] text-muted">
          Keine berechtigten Empfänger für die aktuelle Auswahl.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 text-[14px] text-ink sm:grid-cols-2">
            <p>
              <span className="font-semibold">{summary.teamCount}</span>{" "}
              {summary.teamCount === 1 ? "Team ausgewählt" : "Teams ausgewählt"}
            </p>
            <p>
              <span className="font-semibold">{summary.uniqueEmailCount}</span>{" "}
              {summary.uniqueEmailCount === 1
                ? "eindeutige E-Mail-Adresse"
                : "eindeutige E-Mail-Adressen"}
            </p>
          </div>

          {summary.teamCount !== summary.uniqueEmailCount ? (
            <p className="mt-2 text-[13px] text-muted">
              Mehrere ausgewählte Teams teilen sich dieselbe Empfängeradresse. Beim Versand
              wird jede Adresse nur einmal angeschrieben.
            </p>
          ) : null}

          <ul className="mt-4 grid gap-2 text-[14px] text-ink">
            {summary.uniqueRecipients.map((recipient) => (
              <li
                key={
                  recipient.teamDirectoryEntryId ??
                  recipient.applicationId ??
                  recipient.recipientEmail
                }
              >
                {recipient.recipientTeamName}
                {recipient.recipientClubName ? ` · ${recipient.recipientClubName}` : ""}
                <span className="block text-[12px] text-muted">
                  {recipient.recipientEmail}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
