import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { CLUB_NAME, OFFICIAL_CLUB_WEBSITE } from "@/data/club";

export const metadata: Metadata = withCanonical("/partner", {
  title: "Partner"
});

export default function PartnerPage() {
  return (
    <ContentPage
      title="Partner"
      description={`Partner und Sponsoren unterstützen ${CLUB_NAME}. Konkrete Sponsornamen werden hier nicht hardcodiert.`}
    >
      <p className="max-w-2xl text-[15px] leading-7 text-muted">
        Die aktuelle Sponsorenübersicht veröffentlicht der Verein auf seiner
        offiziellen Website.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href={`${OFFICIAL_CLUB_WEBSITE}sponsoren/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
        >
          Zur Sponsoren-Seite
        </a>
        <Link
          href="/kontakt"
          className="inline-flex h-11 items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
        >
          Kontakt Tournament Hub
        </Link>
      </div>
    </ContentPage>
  );
}
