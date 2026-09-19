import Link from "next/link";
import {
  PartnerLogoGrid,
  PartnerSectionHeader,
} from "@/components/partners/PartnerLogoGrid";
import type { PublicPartner } from "@/types/partner";

type TournamentPartnersSectionProps = {
  partners: PublicPartner[];
};

/**
 * Public tournament detail Partner section (Phase 2C / V2-A strip).
 * Renders nothing when no active assigned Partners exist.
 * Compact horizontal tiles — does not use homepage max-3 layout.
 */
export function TournamentPartnersSection({
  partners,
}: TournamentPartnersSectionProps) {
  if (partners.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 sm:mt-10">
      <PartnerSectionHeader
        title="Partner & Sponsoren"
        compact
        tone="secondary"
        action={
          <Link
            href="/partner"
            className="inline-flex min-h-10 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Alle Partner anzeigen →
          </Link>
        }
      />
      <div className="mt-3">
        <PartnerLogoGrid partners={partners} size="tournament" />
      </div>
    </section>
  );
}
