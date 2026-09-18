import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import {
  PartnerEmptyState,
  PartnerLogoGrid,
} from "@/components/partners/PartnerLogoGrid";
import { CLUB_NAME, OFFICIAL_CLUB_WEBSITE } from "@/data/club";
import { listPublicActivePartners } from "@/lib/partners/queries";
import { withCanonical } from "@/lib/site";

export const metadata: Metadata = withCanonical("/partner", {
  title: "Partner",
});

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  const partners = await listPublicActivePartners();

  return (
    <ContentPage
      title="Partner"
      description="Gemeinsam für den Jugendfußball."
    >
      <p className="max-w-2xl text-[15px] leading-7 text-muted">
        Partner und Sponsoren unterstützen {CLUB_NAME} und unsere
        Jugendturniere. Hier finden Sie die aktuellen Partner des Tournament
        Hubs.
      </p>

      <div className="mt-10">
        {partners.length > 0 ? (
          <PartnerLogoGrid partners={partners} size="page" />
        ) : (
          <PartnerEmptyState message="Derzeit sind noch keine Partner hinterlegt. Schauen Sie bald wieder vorbei." />
        )}
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/kontakt"
          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy"
        >
          Kontakt Tournament Hub
        </Link>
        <a
          href={`${OFFICIAL_CLUB_WEBSITE}sponsoren/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          Sponsoren auf der Vereinswebsite
        </a>
      </div>
    </ContentPage>
  );
}
