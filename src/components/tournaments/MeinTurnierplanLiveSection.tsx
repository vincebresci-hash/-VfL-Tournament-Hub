import Link from "next/link";
import { MeinTurnierplanWidget } from "@/components/tournaments/MeinTurnierplanWidget";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import {
  resolvePublicMatchesWidgetUrl,
  resolvePublicTableWidgetUrl,
} from "@/lib/mein-turnierplan-live-render";
import type { MeinTurnierplanFields } from "@/lib/mein-turnierplan";
import type { TournamentStatus } from "@/types/tournament";

type MeinTurnierplanLiveSectionProps = {
  slug: string;
  section: "spielplan" | "tabelle";
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
  slug,
  section,
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
  const showTableNav = Boolean(resolvedTableWidgetUrl);

  if (section === "tabelle" && !resolvedTableWidgetUrl) {
    return null;
  }

  const activeWidgetUrl =
    section === "spielplan" ? resolvedMatchesWidgetUrl : resolvedTableWidgetUrl;
  const widgetTitle =
    section === "spielplan"
      ? "MeinTurnierplan Spielplan"
      : `MeinTurnierplan Live-Tabelle für ${tournamentName}`;

  return (
    <section className="mt-8 w-full" data-live-section={section}>
      {showTableNav ? (
        <div className="flex flex-wrap gap-2" aria-label="Live-Bereiche">
          <Link
            href={`/turniere/${slug}?tab=live&live=spielplan`}
            className={
              section === "spielplan"
                ? "inline-flex h-9 items-center bg-navy px-3 text-[11px] font-semibold tracking-[0.08em] text-white uppercase"
                : "inline-flex h-9 items-center border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
            }
          >
            Jetzt / Spielplan
          </Link>
          <Link
            href={`/turniere/${slug}?tab=live&live=tabelle`}
            className={
              section === "tabelle"
                ? "inline-flex h-9 items-center bg-navy px-3 text-[11px] font-semibold tracking-[0.08em] text-white uppercase"
                : "inline-flex h-9 items-center border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
            }
          >
            Tabelle
          </Link>
        </div>
      ) : null}

      {publicLiveNote ? (
        <p className="mt-5 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          {publicLiveNote}
        </p>
      ) : null}

      {activeWidgetUrl ? (
        <div className="mt-5 w-full" data-widget-url-present="true">
          <MeinTurnierplanWidget
            url={activeWidgetUrl}
            title={widgetTitle}
            iframeId={section === "spielplan" ? "widgetMatches" : "widgetTable"}
          />
        </div>
      ) : section === "spielplan" && presentationUrl ? (
        <div className="mt-5">
          <MeinTurnierplanPublicButton
            tournamentName={tournamentName}
            tournamentDate={tournamentDate}
            tournamentStatus={tournamentStatus}
            url={presentationUrl}
            customLabel={customLabel}
          />
        </div>
      ) : section === "spielplan" ? (
        <p className="mt-5 border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          Für diesen Bereich ist noch keine MeinTurnierplan-Widget-URL hinterlegt.
        </p>
      ) : null}
    </section>
  );
}
