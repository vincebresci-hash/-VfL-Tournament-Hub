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
    <section
      className="mt-8 min-w-0 w-full max-w-full"
      data-live-section="combined"
      aria-labelledby="live-mtp-heading"
    >
      <div className="min-w-0 max-w-full rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]">
        <div className="border-b border-line/80 pb-2.5">
          <h2
            id="live-mtp-heading"
            className="font-display text-2xl font-bold tracking-wide text-ink uppercase"
          >
            Live / MeinTurnierplan
          </h2>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-6 text-muted">
            Aktuelle Spielinformationen werden über MeinTurnierplan bereitgestellt.
          </p>
          <p className="mt-1 text-[12px] font-medium tracking-wide text-muted">
            Bereitgestellt über MeinTurnierplan
          </p>
        </div>

        {publicLiveNote ? (
          <p className="mt-3.5 rounded-[8px] border border-line bg-[#fafbfc] px-3.5 py-2.5 text-[14px] leading-6 text-muted">
            {publicLiveNote}
          </p>
        ) : null}

        {resolvedMatchesWidgetUrl ? (
          <div
            className="mt-3.5 min-w-0 w-full max-w-full"
            data-widget-url-present="matches"
          >
            <MeinTurnierplanWidget
              url={resolvedMatchesWidgetUrl}
              title="MeinTurnierplan Spielplan"
              iframeId="widgetMatches"
            />
          </div>
        ) : null}

        {resolvedTableWidgetUrl ? (
          <div
            className={`${resolvedMatchesWidgetUrl ? "mt-5" : "mt-3.5"} min-w-0 w-full max-w-full`}
            data-widget-url-present="table"
          >
            <MeinTurnierplanWidget
              url={resolvedTableWidgetUrl}
              title={`MeinTurnierplan Tabelle für ${tournamentName}`}
              iframeId="widgetTable"
            />
          </div>
        ) : null}

        {!hasWidgets && presentationUrl ? (
          <div className="mt-3.5">
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
          <p className="mt-3.5 rounded-[8px] border border-line bg-[#fafbfc] px-3.5 py-2.5 text-[14px] leading-6 text-muted">
            Für diesen Bereich ist noch keine MeinTurnierplan-Widget-URL hinterlegt.
          </p>
        ) : null}
      </div>
    </section>
  );
}
