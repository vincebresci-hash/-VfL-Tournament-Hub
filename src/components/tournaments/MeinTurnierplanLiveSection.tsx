"use client";

import Link from "next/link";
import { MeinTurnierplanWidget } from "@/components/tournaments/MeinTurnierplanWidget";
import { MeinTurnierplanPublicButton } from "@/components/tournaments/MeinTurnierplanPublicButton";
import type { TournamentStatus } from "@/types/tournament";

type MeinTurnierplanLiveSectionProps = {
  slug: string;
  section: "spielplan" | "tabelle";
  tournamentName: string;
  tournamentDate: string;
  tournamentStatus: TournamentStatus;
  presentationUrl: string;
  customLabel?: string | null;
  matchesWidgetUrl?: string | null;
  tableWidgetUrl?: string | null;
  publicLiveNote?: string | null;
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
}: MeinTurnierplanLiveSectionProps) {
  const widgetUrl = section === "spielplan" ? matchesWidgetUrl : tableWidgetUrl;
  const widgetTitle =
    section === "spielplan"
      ? `MeinTurnierplan Live-Spielplan für ${tournamentName}`
      : `MeinTurnierplan Live-Tabelle für ${tournamentName}`;

  return (
    <section className="mt-8">
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

      {publicLiveNote ? (
        <p className="mt-5 max-w-3xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-muted">
          {publicLiveNote}
        </p>
      ) : null}

      {widgetUrl ? (
        <div className="mt-5">
          <MeinTurnierplanWidget
            url={widgetUrl}
            title={widgetTitle}
            loadLabel={
              section === "spielplan" ? "Live-Spielplan laden" : "Live-Tabelle laden"
            }
          />
        </div>
      ) : (
        <div className="mt-5">
          <MeinTurnierplanPublicButton
            tournamentName={tournamentName}
            tournamentDate={tournamentDate}
            tournamentStatus={tournamentStatus}
            url={presentationUrl}
            customLabel={customLabel}
          />
        </div>
      )}
    </section>
  );
}
