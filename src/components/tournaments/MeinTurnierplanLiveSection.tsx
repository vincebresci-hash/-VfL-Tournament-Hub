import { MeinTurnierplanWidget } from "@/components/tournaments/MeinTurnierplanWidget";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import {
  resolvePublicMatchesWidgetUrl,
  resolvePublicTableWidgetUrl,
} from "@/lib/mein-turnierplan-live-render";
import type { MeinTurnierplanFields } from "@/lib/mein-turnierplan";
import type { TournamentStatus } from "@/types/tournament";

type MeinTurnierplanLiveSectionProps = {
  tournamentName: string;
  tournamentDate: string;
  tournamentStatus: TournamentStatus;
  presentationUrl?: string | null;
  customLabel?: string | null;
  matchesWidgetUrl?: string | null;
  tableWidgetUrl?: string | null;
  publicLiveNote?: string | null;
  meinTurnierplanEmbedUrl?: string | null;
};

export function MeinTurnierplanLiveSection({
  tournamentName,
  tournamentDate,
  tournamentStatus,
  presentationUrl,
  customLabel,
  matchesWidgetUrl,
  tableWidgetUrl,
  publicLiveNote,
  meinTurnierplanEmbedUrl = null,
}: MeinTurnierplanLiveSectionProps) {
  const tournamentFields: MeinTurnierplanFields = {
    meinTurnierplanEnabled: true,
    meinTurnierplanUrl: presentationUrl ?? null,
    meinTurnierplanEmbedUrl,
    meinTurnierplanMatchesWidgetUrl: matchesWidgetUrl ?? null,
    meinTurnierplanTableWidgetUrl: tableWidgetUrl ?? null,
  };
  const resolvedMatchesWidgetUrl = resolvePublicMatchesWidgetUrl(tournamentFields);
  const resolvedTableWidgetUrl = resolvePublicTableWidgetUrl(tournamentFields);
  const hasWidgets = Boolean(resolvedMatchesWidgetUrl || resolvedTableWidgetUrl);

  return (
    <section className="mt-8 w-full" data-live-section="combined">
      {publicLiveNote ? (
        <p className="max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          {publicLiveNote}
        </p>
      ) : null}

      {resolvedMatchesWidgetUrl ? (
        <div className={`${publicLiveNote ? "mt-5" : ""} w-full`} data-widget-url-present="matches">
          <MeinTurnierplanWidget
            url={resolvedMatchesWidgetUrl}
            title="MeinTurnierplan Spielplan"
            iframeId="widgetMatches"
          />
        </div>
      ) : null}

      {resolvedTableWidgetUrl ? (
        <div className={`${hasWidgets ? "mt-8" : publicLiveNote ? "mt-5" : ""} w-full`} data-widget-url-present="table">
          <MeinTurnierplanWidget
            url={resolvedTableWidgetUrl}
            title={`MeinTurnierplan Tabelle für ${tournamentName}`}
            iframeId="widgetTable"
          />
        </div>
      ) : null}

      {!hasWidgets && presentationUrl ? (
        <div className={publicLiveNote ? "mt-5" : ""}>
          <MeinTurnierplanPublicButton
            tournamentName={tournamentName}
            tournamentDate={tournamentDate}
            tournamentStatus={tournamentStatus}
            url={presentationUrl}
            customLabel={customLabel}
          />
        </div>
      ) : null}

      {!hasWidgets && !presentationUrl ? (
        <p className={`${publicLiveNote ? "mt-5" : ""} border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted`}>
          Für diesen Bereich ist noch keine MeinTurnierplan-Widget-URL hinterlegt.
        </p>
      ) : null}
    </section>
  );
}
